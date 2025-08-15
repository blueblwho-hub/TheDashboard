document.addEventListener('DOMContentLoaded', () => {

    // --- Element Declarations ---
    const timerWidget = document.getElementById('timer-widget');
    const countdownLabel = document.getElementById('countdown-label');
    const countdownTimer = document.getElementById('countdown-timer');
    const taskTable = document.getElementById('sheets-data-table');
    const taskWidgetTitle = document.getElementById('task-widget-title');
    const todoListContainer = document.getElementById('todo-list-container');
    const currentTaskNameEl = document.getElementById('current-task-name');
    const currentTaskTimerEl = document.getElementById('current-task-timer');
    const dingSound = document.getElementById('ding-sound');

    // --- State Variables ---
    let countdownInterval = null;
    let taskTimerInterval = null;
    let currentDashboardState = null;
    let isToDoInitialized = false;
    let currentRoutineId = null; // NEW: To "remember" the currently running routine

    // --- Helper function to update the main event countdown timer ---
    function updateCountdown(event) {
        if (!event || !event.start) {
            if (currentDashboardState !== 'todo') initializeDashboard();
            return;
        }
        const now = new Date();
        const startTime = new Date(event.start.dateTime || event.start.date);
        const endTime = new Date(event.end.dateTime || event.end.date);
        const isEventInProgress = (now >= startTime && now < endTime);
        const hasRoutineDescription = event.description && event.description.toLowerCase().endsWith('.r');
        const newDashboardState = (isEventInProgress && hasRoutineDescription) ? 'routine' : 'todo';

        if (newDashboardState !== currentDashboardState) {
            initializeDashboard();
            return;
        }
        
        let targetDate, labelText;
        if (now < startTime) {
            targetDate = startTime;
            labelText = "Time Until: " + event.summary;
        } else {
            targetDate = endTime;
            labelText = "Time Left: " + event.summary;
        }
        const diff = targetDate - now;
        if (diff <= 0) {
            initializeDashboard();
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        countdownLabel.textContent = labelText;
        countdownTimer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        timerWidget.classList.toggle('in-progress', isEventInProgress);
    }

    // --- Helper function to update the full routine tasks table ---
    function updateTaskTable(data) {
        taskTable.classList.remove('hidden');
        todoListContainer.classList.add('hidden');
        taskWidgetTitle.textContent = "Full Routine";
        currentDashboardState = 'routine';

        if (!data || data.length === 0) {
            taskTable.innerHTML = '<tr><td>No tasks found.</td></tr>';
            return;
        }
        taskTable.innerHTML = '';
        const thead = taskTable.createTHead();
        const headerRow = thead.insertRow();
        data[0].forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        const tbody = taskTable.createTBody();
        data.slice(1).forEach((rowData, rowIndex) => {
            const row = tbody.insertRow();
            row.dataset.taskId = rowIndex;
            rowData.forEach(cellData => {
                const cell = row.insertCell();
                cell.textContent = cellData;
            });
        });
    }

    // --- Functions to manage the interactive To-Do List ---
    function initializeToDoList() {
        taskTable.classList.add('hidden');
        todoListContainer.classList.remove('hidden');
        taskWidgetTitle.textContent = "To-Do List";
        clearCurrentTask();
        currentDashboardState = 'todo';

        const input = document.getElementById('todo-input');
        const addButton = document.getElementById('add-task-btn');
        const list = document.getElementById('todo-list');

        const saveTasks = () => {
            const tasks = [];
            list.querySelectorAll('li').forEach(item => {
                tasks.push({
                    text: item.textContent,
                    completed: item.classList.contains('completed'),
                    completedAt: item.dataset.completedAt || null
                });
            });
            localStorage.setItem('todoTasks', JSON.stringify(tasks));
        };

        const addTask = (task) => {
            const listItem = document.createElement('li');
            listItem.textContent = task.text;
            if (task.completed) listItem.classList.add('completed');
            if (task.completedAt) listItem.dataset.completedAt = task.completedAt;
            
            listItem.addEventListener('click', () => {
                listItem.classList.toggle('completed');
                if (listItem.classList.contains('completed')) {
                    listItem.dataset.completedAt = Date.now();
                } else {
                    delete listItem.dataset.completedAt;
                }
                saveTasks();
            });
            list.appendChild(listItem);
        };

        const loadTasks = () => {
            list.innerHTML = '';
            const savedTasks = JSON.parse(localStorage.getItem('todoTasks') || '[]');
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            
            const visibleTasks = savedTasks.filter(task => {
                if (!task.completed) return true;
                return task.completedAt >= startOfToday.getTime();
            });
            visibleTasks.forEach(task => addTask(task));
        };

        if (!isToDoInitialized) {
            addButton.addEventListener('click', () => {
                const taskText = input.value.trim();
                if (taskText) {
                    addTask({ text: taskText, completed: false });
                    saveTasks();
                    input.value = '';
                }
            });
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addButton.click();
            });
            isToDoInitialized = true;
        }
        loadTasks();
    }

     // --- MODIFIED: Functions to manage the Current Task sequence ---
    let taskSequence = [];
    let currentTaskIndex = -1;
    let taskTimeRemaining = 0;
    let isSequencePaused = true;

    function startTaskSequence(sheetData, eventId) {
        // NEW: Check if this is the same routine that's already running.
        // If it is, do nothing and let the current sequence continue.
        if (eventId === currentRoutineId && !isSequencePaused) {
            return;
        }

        // If it's a new routine, set it up from the beginning.
        currentRoutineId = eventId;
        if (taskTimerInterval) clearInterval(taskTimerInterval);
        taskSequence = sheetData.slice(1);
        currentTaskIndex = 0;
        isSequencePaused = true;
        taskTable.querySelectorAll('tr').forEach(row => row.classList.remove('task-completed', 'task-active'));
        
        if (taskSequence.length > 0) {
            const firstTask = taskSequence[0];
            const taskName = firstTask[0];
            const taskDuration = parseInt(firstTask[1], 10) || 0;
            taskTimeRemaining = taskDuration; // Set initial time
            const minutes = Math.floor(taskDuration / 60);
            const seconds = taskDuration % 60;
            currentTaskNameEl.textContent = taskName;
            currentTaskTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            const activeRow = taskTable.querySelector(`[data-task-id='0']`);
            if (activeRow) activeRow.classList.add('task-active');
        } else {
            clearCurrentTask();
        }
    }

     // --- MODIFIED: This function now starts a new timer for each task ---
    function displayCurrentTask() {
        const prevRow = taskTable.querySelector('.task-active');
        if (prevRow) prevRow.classList.remove('task-active');
    
        if (currentTaskIndex >= taskSequence.length) {
            currentTaskNameEl.textContent = "Routine Complete!";
            currentTaskTimerEl.textContent = "🎉";
            clearInterval(taskTimerInterval);
            return;
        }
    
        const activeRow = taskTable.querySelector(`[data-task-id='${currentTaskIndex}']`);
        if (activeRow) activeRow.classList.add('task-active');
    
        const currentTask = taskSequence[currentTaskIndex];
        const taskName = currentTask[0];
        const taskDuration = parseInt(currentTask[1], 10) || 0;
        currentTaskNameEl.textContent = taskName;
        taskTimeRemaining = taskDuration;
        
        // Start a fresh timer for this new task
        updateTaskTimer(); // Run once immediately to display the correct time
        taskTimerInterval = setInterval(updateTaskTimer, 1000);
    }
    function updateTaskTimer() {
        if (isSequencePaused) return;

        if (taskTimeRemaining <= 0) {
            clearInterval(taskTimerInterval);
            if (dingSound) dingSound.play();
            const completedRow = taskTable.querySelector(`[data-task-id='${currentTaskIndex}']`);
            if (completedRow) {
                completedRow.classList.remove('task-active');
                completedRow.classList.add('task-completed');
            }
            currentTaskIndex++;
            displayCurrentTask();
            return;
        }

        taskTimeRemaining--;
        const minutes = Math.floor(taskTimeRemaining / 60);
        const seconds = taskTimeRemaining % 60;
        currentTaskTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function clearCurrentTask() {
        clearInterval(taskTimerInterval);
        if (currentTaskNameEl) currentTaskNameEl.textContent = "--";
        if (currentTaskTimerEl) currentTaskTimerEl.textContent = "--:--";
        currentRoutineId = null; // NEW: Clear routine memory
    }

    // --- Main function to fetch all dashboard data ---
    async function initializeDashboard() {
        if (countdownInterval) clearInterval(countdownInterval);
        
        try {
            const response = await fetch('http://localhost:3001/dashboard-data');
            const data = await response.json();
            
            if (data.sheetData && data.sheetData.length > 0) {
                updateTaskTable(data.sheetData);
                // Pass the unique event ID to the sequencer
                startTaskSequence(data.sheetData, data.nextEvent.id);
            } else {
                // If there's no routine, clear the routine memory
                currentRoutineId = null;
                initializeToDoList();
            }
            
            updateCountdown(data.nextEvent);
            countdownInterval = setInterval(() => updateCountdown(data.nextEvent), 1000);
        } catch (error) {
            console.error('Error initializing dashboard:', error);
            countdownLabel.textContent = 'Error loading data.';
            initializeToDoList();
        }
    }
    
   // --- MODIFIED: The click handler now just unpauses and calls displayCurrentTask ---
    function startRoutineAndUnlockAudio() {
        if (dingSound && dingSound.paused) {
            dingSound.play().catch(e => {});
            dingSound.pause();
            dingSound.currentTime = 0;
            console.log('Audio unlocked.');
        }

        if (currentDashboardState === 'routine' && isSequencePaused) {
            isSequencePaused = false;
            console.log('Task sequence started.');
            // This call will start the timer for the very first task
            displayCurrentTask();
        }
        
        document.removeEventListener('click', startRoutineAndUnlockAudio);
    }
    document.addEventListener('click', startRoutineAndUnlockAudio);

    // --- Initial Calls ---
    initializeDashboard();
    setInterval(initializeDashboard, 300000);
});