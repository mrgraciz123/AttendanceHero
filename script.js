document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const courseDashboardView = document.getElementById('course-dashboard-view');
    const courseListViewDiv = document.getElementById('course-list-container');
    const showAddCourseModalBtn = document.getElementById('show-add-course-modal-btn');

    const courseModal = document.getElementById('course-modal');
    const courseModalTitle = document.getElementById('course-modal-title');
    const courseFormModal = document.getElementById('course-form-modal');
    const courseModalIdInput = document.getElementById('course-modal-id');
    const courseNameModalInput = document.getElementById('course-name-modal');
    const totalClassesModalInput = document.getElementById('total-classes-modal');
    const targetAttendanceModalInput = document.getElementById('target-attendance-modal');
    const closeCourseModalBtn = document.getElementById('close-course-modal-btn');
    const cancelCourseModalBtn = document.getElementById('cancel-course-modal-btn');
    const saveCourseModalBtn = document.getElementById('save-course-modal-btn');

    const courseDetailView = document.getElementById('course-detail-view');
    const detailCourseNameTitle = document.getElementById('detail-course-name-title');
    const editCourseBtn = document.getElementById('edit-course-btn');
    const detailStatsCardsDiv = document.getElementById('detail-stats-cards');
    const logAttendanceFormDetail = document.getElementById('log-attendance-form');
    const logCourseIdDetailInput = document.getElementById('log-course-id-detail');
    const attendanceDateDetailInput = document.getElementById('attendance-date-detail');
    const attendanceTimeDetailInput = document.getElementById('attendance-time-detail');
    const attendanceStatusDetailSelect = document.getElementById('attendance-status-detail');
    const attendanceNotesDetailInput = document.getElementById('attendance-notes-detail');
    const attendanceHistoryListDetailUl = document.getElementById('attendance-history-list-detail');
    const backToDashboardBtnDetail = document.getElementById('back-to-dashboard-btn');

    const toastContainer = document.getElementById('toast-container');
    const currentYearSpan = document.getElementById('current-year');
    if (currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();

    // --- State ---
    let courses = [];
    let currentView = 'dashboard';
    let selectedCourseId = null;
    let editingCourseId = null;

    const COURSES_STORAGE_KEY = 'attendanceHeroCourses_v4'; // Incremented for "classes to attend" feature

    // --- Utility Functions ---
    function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }

    function showToast(message, type = 'info', duration = 3000) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.classList.add('toast', type);

        let iconClass = 'fas fa-info-circle';
        if (type === 'success') iconClass = 'fas fa-check-circle';
        if (type === 'error') iconClass = 'fas fa-times-circle';
        if (type === 'warning') iconClass = 'fas fa-exclamation-triangle';

        toast.innerHTML = `<i class="${iconClass}"></i> <p>${message}</p>`;
        toastContainer.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }

    function saveCoursesToLocalStorage() {
        try {
            localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
        } catch (error) {
            console.error("Error saving courses to localStorage:", error);
            showToast("Could not save data. Storage might be full.", "error");
        }
    }

    function loadCoursesFromLocalStorage() {
        const storedCourses = localStorage.getItem(COURSES_STORAGE_KEY);
        if (storedCourses) {
            try {
                const parsedCourses = JSON.parse(storedCourses);
                if (Array.isArray(parsedCourses)) {
                    courses = parsedCourses.map(course => ({
                        ...course,
                        attendanceLog: (course.attendanceLog && Array.isArray(course.attendanceLog))
                            ? course.attendanceLog.map(entry => {
                                const entryDateTime = entry.dateTime ? new Date(entry.dateTime) : null;
                                return { ...entry, dateTime: entryDateTime };
                            })
                            : [],
                        targetAttendancePercentage: parseFloat(course.targetAttendancePercentage) || 75,
                        totalClasses: parseInt(course.totalClasses) || 0,
                    }));
                } else { courses = []; }
            } catch (error) {
                console.error("Error parsing courses from localStorage:", error);
                courses = [];
                showToast("Error loading saved data. It might be corrupted.", "error");
            }
        } else { courses = []; }
    }

    // --- Calculation Functions ---
    function getClassesHeldSoFar(course) {
        if (!course || !course.attendanceLog) return 0;
        return course.attendanceLog.filter(entry =>
            entry.status === 'present' || entry.status === 'absent' || entry.status === 'late'
        ).length;
    }
    function getClassesAttended(course) {
        if (!course || !course.attendanceLog) return 0;
        return course.attendanceLog.filter(entry =>
            entry.status === 'present' || entry.status === 'late'
        ).length;
    }
    function getCurrentAttendancePercentage(course) {
        if (!course) return 0.0;
        const held = getClassesHeldSoFar(course);
        if (held === 0) return 100.0;
        const attended = getClassesAttended(course);
        return (attended / held) * 100.0;
    }
    function getAllowableAbsences(course) {
        if (!course || !course.totalClasses || course.totalClasses <= 0) return Infinity;
        const targetPercent = parseFloat(course.targetAttendancePercentage) || 75;
        const maxAllowedMisses = Math.floor(course.totalClasses * (1 - (targetPercent / 100.0)));
        return maxAllowedMisses;
    }
    function getRemainingMissableClasses(course) {
        if (!course) return "N/A";
        const allowable = getAllowableAbsences(course);
        if (allowable === Infinity) return "N/A (Set Total Classes)";
        const missedSoFar = course.attendanceLog.filter(entry => entry.status === 'absent').length;
        const remaining = allowable - missedSoFar;
        return remaining < 0 ? 0 : remaining;
    }

    // NEW CALCULATION FUNCTION
    function getRequiredFutureAttendances(course) {
        if (!course || !course.totalClasses || course.totalClasses <= 0) {
            return "N/A (Set Total Classes)";
        }

        const totalPlanned = parseInt(course.totalClasses);
        const targetAttendPercentNum = parseFloat(course.targetAttendancePercentage) || 75;
        const targetPercentDecimal = targetAttendPercentNum / 100.0;

        const classesHeldSoFar = getClassesHeldSoFar(course);
        const classesAttendedSoFar = getClassesAttended(course);

        const minTotalAttendedRequired = Math.ceil(totalPlanned * targetPercentDecimal);
        const futureAttendancesNeeded = minTotalAttendedRequired - classesAttendedSoFar;
        const remainingClassesInCourse = totalPlanned - classesHeldSoFar;

        if (futureAttendancesNeeded <= 0) {
            return "Target Met/Exceeded";
        }

        if (remainingClassesInCourse < 0) { // Should not happen if totalClasses >= classesHeldSoFar
             return "Error: Classes held exceed total planned.";
        }
        if (futureAttendancesNeeded > remainingClassesInCourse) {
             // Check if course is already over and target wasn't met
            if (classesHeldSoFar >= totalPlanned) {
                 return `Target Not Met (${classesAttendedSoFar}/${totalPlanned} attended)`;
            }
            return `Cannot Reach Target (Need ${futureAttendancesNeeded} from ${remainingClassesInCourse} left)`;
        }
        if (remainingClassesInCourse === 0 && futureAttendancesNeeded > 0) {
            return `Target Not Met (${classesAttendedSoFar}/${totalPlanned} attended)`;
        }

        return `Attend ${futureAttendancesNeeded} of next ${remainingClassesInCourse} classes`;
    }


    // --- UI Update Functions ---
    function switchView(viewToShow) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
        const targetView = document.getElementById(viewToShow);
        if (targetView) {
            targetView.classList.add('active-view');
            currentView = viewToShow.replace('-view', '');
        }

        if (currentView === 'course-dashboard') renderCourseList();
        if (currentView === 'course-detail' && selectedCourseId) renderCourseDetail();
    }

    function openCourseModal(courseToEdit = null) {
        courseFormModal.reset();
        if (courseToEdit) {
            editingCourseId = courseToEdit.id;
            courseModalTitle.textContent = "Edit Course";
            courseModalIdInput.value = courseToEdit.id;
            courseNameModalInput.value = courseToEdit.name;
            totalClassesModalInput.value = courseToEdit.totalClasses || '';
            targetAttendanceModalInput.value = courseToEdit.targetAttendancePercentage;
            saveCourseModalBtn.innerHTML = '<i class="fas fa-save"></i> Update Course';
        } else {
            editingCourseId = null;
            courseModalTitle.textContent = "Add New Course";
            courseModalIdInput.value = '';
            saveCourseModalBtn.innerHTML = '<i class="fas fa-save"></i> Save Course';
        }
        courseModal.classList.add('active-view');
    }

    function closeCourseModal() {
        courseModal.classList.remove('active-view');
        editingCourseId = null;
    }

    function renderCourseList() {
        courseListViewDiv.innerHTML = '';
        if (courses.length === 0) {
            courseListViewDiv.innerHTML = `
                <div class="empty-state-message">
                    <i class="fas fa-folder-open"></i>
                    <p>No courses here yet!</p>
                    <p>Click "Add New Course" to track your attendance.</p>
                </div>`;
            return;
        }
        courses.forEach(course => {
            const courseCard = document.createElement('div');
            courseCard.classList.add('course-card');

            const percentage = getCurrentAttendancePercentage(course);
            const missable = getRemainingMissableClasses(course);
            const attended = getClassesAttended(course);
            const held = getClassesHeldSoFar(course);
            const targetPercent = parseFloat(course.targetAttendancePercentage) || 75;
            let statusBarClass = percentage >= targetPercent ? 'status-green' : (percentage >= targetPercent - 10 ? 'status-orange' : 'status-red');
            const requiredFuture = getRequiredFutureAttendances(course); // GET NEW DATA

            courseCard.innerHTML = `
                <div class="course-card-content">
                    <h3 data-course-id="${course.id}">${course.name || 'Unnamed Course'}</h3>
                    <p>Target: <strong>${targetPercent}%</strong> | Total: <strong>${course.totalClasses > 0 ? course.totalClasses : 'N/A'}</strong></p>
                    <p>Current: <strong>${percentage.toFixed(1)}%</strong> (${attended}/${held})</p>
                    <p>Can still miss: <strong>${(typeof missable === 'number' && course.totalClasses > 0) ? missable : 'N/A'}</strong></p>
                    <p class="future-attendance-info">To Meet Target: <strong>${requiredFuture}</strong></p> <!-- DISPLAY NEW DATA -->
                </div>
                <div class="attendance-bar-container">
                    <div class="attendance-bar ${statusBarClass}" style="width: ${Math.min(100, percentage.toFixed(1))}%;"></div>
                </div>
                <div class="course-card-actions">
                    <button class="btn-icon edit" title="Edit Course" data-course-id="${course.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" title="Delete Course" data-course-id="${course.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            courseCard.querySelector('h3').addEventListener('click', (e) => {
                selectedCourseId = e.target.dataset.courseId;
                switchView('course-detail-view');
            });
            courseCard.querySelector('.btn-icon.edit').addEventListener('click', (e) => {
                const courseIdToEdit = e.currentTarget.dataset.courseId;
                const courseObj = courses.find(c => c.id === courseIdToEdit);
                if (courseObj) openCourseModal(courseObj);
            });
            courseCard.querySelector('.btn-icon.delete').addEventListener('click', (e) => {
                const courseIdToDelete = e.currentTarget.dataset.courseId;
                if (confirm(`Are you sure you want to delete the course "${courses.find(c=>c.id===courseIdToDelete)?.name || 'this course'}"? This action cannot be undone.`)) {
                    deleteCourse(courseIdToDelete);
                }
            });
            courseListViewDiv.appendChild(courseCard);
        });
    }

    function renderCourseDetail() {
        const course = courses.find(c => c.id === selectedCourseId);
        if (!course) {
            showToast("Could not find course details.", "error");
            switchView('course-dashboard-view');
            return;
        }

        if (detailCourseNameTitle) detailCourseNameTitle.textContent = course.name || 'Unnamed Course';
        if (logCourseIdDetailInput) logCourseIdDetailInput.value = course.id;
        if (attendanceDateDetailInput) attendanceDateDetailInput.valueAsDate = new Date();
        if (attendanceTimeDetailInput) attendanceTimeDetailInput.value = '';
        if (editCourseBtn) editCourseBtn.dataset.courseId = course.id;

        if (detailStatsCardsDiv) {
            const percentage = getCurrentAttendancePercentage(course);
            const attended = getClassesAttended(course);
            const held = getClassesHeldSoFar(course);
            const missable = getRemainingMissableClasses(course);
            const targetPercent = parseFloat(course.targetAttendancePercentage) || 75;
            const totalClasses = parseInt(course.totalClasses) || 0;
            const requiredFutureDetail = getRequiredFutureAttendances(course); // GET NEW DATA
            let requiredFutureClass = '';
            if (typeof requiredFutureDetail === 'string' && (requiredFutureDetail.toLowerCase().includes('cannot reach') || requiredFutureDetail.toLowerCase().includes('not met'))) {
                requiredFutureClass = 'text-danger';
            } else if (typeof requiredFutureDetail === 'string' && requiredFutureDetail.toLowerCase().includes('target met')) {
                requiredFutureClass = 'text-success';
            }

            detailStatsCardsDiv.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${percentage.toFixed(1)}%</div>
                    <div class="stat-label">Current</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${attended} / ${held}</div>
                    <div class="stat-label">Attended / Held</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(typeof missable === 'number' && course.totalClasses > 0) ? missable : 'N/A'}</div>
                    <div class="stat-label">Can Miss</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${targetPercent}%</div>
                    <div class="stat-label">Target</div>
                </div>
                ${totalClasses > 0 ? `
                <div class="stat-card">
                    <div class="stat-value">${totalClasses}</div>
                    <div class="stat-label">Total Planned</div>
                </div>` : ''}
                <div class="stat-card"> <!-- DISPLAY NEW DATA -->
                    <div class="stat-value ${requiredFutureClass}" style="font-size: ${requiredFutureDetail.length > 20 ? '1.1rem' : '1.6rem'}; line-height: 1.2;">
                        ${requiredFutureDetail}
                    </div>
                    <div class="stat-label">To Meet Target</div>
                </div>
            `;
        }

        if (attendanceHistoryListDetailUl) {
            attendanceHistoryListDetailUl.innerHTML = '';
            if (course.attendanceLog && course.attendanceLog.length > 0) {
                const sortedLog = [...course.attendanceLog].sort((a, b) => {
                    const dateA = a.dateTime instanceof Date ? a.dateTime.getTime() : 0;
                    const dateB = b.dateTime instanceof Date ? b.dateTime.getTime() : 0;
                    return dateB - dateA;
                });

                sortedLog.forEach(entry => {
                    const li = document.createElement('li');
                    const isValidDateTime = entry.dateTime instanceof Date && !isNaN(entry.dateTime);
                    const formattedDate = isValidDateTime ? entry.dateTime.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "Invalid Date";
                    const formattedTime = isValidDateTime ? entry.dateTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }) : "";
                    let statusText = entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : "Unknown";
                    if (entry.status === 'canceled') statusText = "Class Canceled";
                    if (entry.status === 'holiday') statusText = "Holiday";

                    li.innerHTML = `
                        <span class="entry-info">
                            <strong>${formattedDate} ${formattedTime}:</strong> ${statusText}
                            ${entry.notes ? `<span class="entry-notes"><em>Note:</em> ${entry.notes}</span>` : ''}
                        </span>
                        <span class="entry-actions">
                            <button class="btn-icon" title="Delete this entry" data-entry-datetime="${isValidDateTime ? entry.dateTime.toISOString() : ''}">
                                <i class="fas fa-times"></i>
                            </button>
                        </span>
                    `;
                    const deleteButton = li.querySelector('button');
                    if (deleteButton) {
                        deleteButton.addEventListener('click', function () {
                            if (confirm('Delete this attendance entry?')) {
                                const entryDateTimeStr = this.dataset.entryDatetime;
                                if (entryDateTimeStr) {
                                    deleteAttendanceEntry(course.id, new Date(entryDateTimeStr));
                                } else {
                                    showToast("Cannot delete entry: date/time is invalid.", "error");
                                }
                            }
                        });
                    }
                    attendanceHistoryListDetailUl.appendChild(li);
                });
            } else {
                attendanceHistoryListDetailUl.innerHTML = '<li class="empty-state-message" style="padding:1rem; font-size:0.9rem;">No attendance logged yet for this course.</li>';
            }
        }
    }

    // --- Event Handlers ---
    showAddCourseModalBtn?.addEventListener('click', () => openCourseModal());
    closeCourseModalBtn?.addEventListener('click', closeCourseModal);
    cancelCourseModalBtn?.addEventListener('click', closeCourseModal);
    courseModal?.addEventListener('click', (e) => { if (e.target === courseModal) closeCourseModal(); });

    courseFormModal?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCourseModalBtn.disabled = true;
        saveCourseModalBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const courseData = {
            id: editingCourseId || generateId(),
            name: courseNameModalInput.value.trim(),
            totalClasses: parseInt(totalClassesModalInput.value) || 0,
            targetAttendancePercentage: parseFloat(targetAttendanceModalInput.value) || 75,
            attendanceLog: editingCourseId ? (courses.find(c => c.id === editingCourseId)?.attendanceLog || []) : []
        };

        if (!courseData.name) {
            showToast("Course name is required.", "error");
            saveCourseModalBtn.disabled = false;
            saveCourseModalBtn.innerHTML = editingCourseId ? '<i class="fas fa-save"></i> Update Course' : '<i class="fas fa-save"></i> Save Course';
            return;
        }

        if (editingCourseId) {
            courses = courses.map(c => c.id === editingCourseId ? courseData : c);
            showToast(`Course "${courseData.name}" updated successfully!`, "success");
        } else {
            courses.push(courseData);
            showToast(`Course "${courseData.name}" added successfully!`, "success");
        }

        saveCoursesToLocalStorage();
        closeCourseModal();
        renderCourseList();
        if (currentView === 'course-detail' && editingCourseId === selectedCourseId) {
             renderCourseDetail();
        }
        saveCourseModalBtn.disabled = false;
    });

    editCourseBtn?.addEventListener('click', (e) => {
        const courseIdToEdit = e.currentTarget.dataset.courseId;
        const courseObj = courses.find(c => c.id === courseIdToEdit);
        if(courseObj) openCourseModal(courseObj);
    });

    logAttendanceFormDetail?.addEventListener('submit', (e) => {
        e.preventDefault();
        const logButton = e.target.querySelector('button[type="submit"]');
        logButton.disabled = true;

        const courseId = logCourseIdDetailInput?.value;
        const course = courses.find(c => c.id === courseId);

        if (course) {
            const dateStr = attendanceDateDetailInput?.value;
            const timeStr = attendanceTimeDetailInput?.value;

            if (!dateStr) {
                showToast("Please select a date.", "error");
                logButton.disabled = false;
                return;
            }
            if (!timeStr) {
                showToast("Please select a class time.", "error");
                logButton.disabled = false;
                return;
            }

            const [hours, minutes] = timeStr.split(':');
            const entryDateTime = new Date(dateStr);
            entryDateTime.setHours(parseInt(hours, 10));
            entryDateTime.setMinutes(parseInt(minutes, 10));
            entryDateTime.setSeconds(0);
            entryDateTime.setMilliseconds(0);

            if (isNaN(entryDateTime.getTime())) {
                showToast("Invalid date or time selected.", "error");
                logButton.disabled = false;
                return;
            }

            const newEntry = {
                dateTime: entryDateTime,
                status: attendanceStatusDetailSelect?.value || 'present',
                notes: attendanceNotesDetailInput?.value.trim() || null
            };

            const existingEntryIndex = course.attendanceLog.findIndex(
                entry => entry.dateTime instanceof Date && entry.dateTime.getTime() === newEntry.dateTime.getTime()
            );

            let overwritten = false;
            if (existingEntryIndex > -1) {
                if (confirm("An entry for this date and time already exists. Overwrite it?")) {
                    course.attendanceLog[existingEntryIndex] = newEntry;
                    overwritten = true;
                } else {
                    logButton.disabled = false;
                    return;
                }
            } else {
                course.attendanceLog.push(newEntry);
            }

            saveCoursesToLocalStorage();
            renderCourseDetail();
            showToast(`Attendance ${overwritten ? 'updated' : 'logged'} for ${entryDateTime.toLocaleDateString()} at ${entryDateTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}.`, "success");
            
            logAttendanceFormDetail.reset();
            if(attendanceDateDetailInput) attendanceDateDetailInput.valueAsDate = new Date(dateStr);
            if(attendanceTimeDetailInput) attendanceTimeDetailInput.value = '';

        } else {
            showToast("Could not log attendance: Course not found.", "error");
        }
        logButton.disabled = false;
    });

    backToDashboardBtnDetail?.addEventListener('click', () => switchView('course-dashboard-view'));

    function deleteCourse(courseIdToDelete) {
        const courseName = courses.find(c => c.id === courseIdToDelete)?.name || "The course";
        courses = courses.filter(course => course.id !== courseIdToDelete);
        saveCoursesToLocalStorage();
        showToast(`"${courseName}" was deleted.`, "success");
        if (selectedCourseId === courseIdToDelete) {
            switchView('course-dashboard-view');
        } else {
            renderCourseList();
        }
    }

    function deleteAttendanceEntry(courseId, entryDateTimeToDelete) {
        const course = courses.find(c => c.id === courseId);
        if (course) {
            course.attendanceLog = course.attendanceLog.filter(
                entry => !(entry.dateTime instanceof Date && entry.dateTime.getTime() === entryDateTimeToDelete.getTime())
            );
            saveCoursesToLocalStorage();
            renderCourseDetail();
            showToast("Attendance entry deleted.", "success");
        }
    }

    // --- Initialization ---
    loadCoursesFromLocalStorage();
    switchView('course-dashboard-view');
});