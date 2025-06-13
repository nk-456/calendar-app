// script.js

// Nager.Date API doesn't require an API key
const CALENDAR_API_BASE_URL = 'https://date.nager.at/api/v3/';
const COUNTRIES_API_URL = 'https://date.nager.at/api/v3/AvailableCountries'; // Endpoint for available countries

const countrySelect = document.getElementById('countrySelect');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const currentMonthYearSpan = document.getElementById('currentMonthYear');
const calendarGrid = document.getElementById('calendar');
const monthlyViewBtn = document.getElementById('monthlyViewBtn');
const quarterlyViewBtn = document.getElementById('quarterlyViewBtn');
const showHolidayWeeksCheckbox = document.getElementById('showHolidayWeeks');

let currentDisplayedDate = new Date();
let currentView = 'monthly';
let holidaysCache = {};
let countries = [];

async function fetchAvailableCountries() {
    try {
        const response = await fetch(COUNTRIES_API_URL);
        if (!response.ok) {
            console.error(`Error fetching countries: HTTP status ${response.status}`);
            alert('Could not fetch list of countries. Please check your internet connection.');
            return [];
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching available countries:', error);
        alert('Could not fetch list of countries. Check console for details.');
        return [];
    }
}

async function populateCountries() {
    countries = await fetchAvailableCountries();
    countrySelect.innerHTML = '';

    countries.sort((a, b) => a.name.localeCompare(b.name));

    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.countryCode;
        option.textContent = country.name;
        countrySelect.appendChild(option);
    });

    countrySelect.value = 'US';
    if (!countrySelect.value && countries.length > 0) {
        countrySelect.value = countries[0].countryCode;
    }

    renderCalendar();
}

async function fetchHolidaysForYear(countryCode, year) {
    const cacheKey = `${countryCode}-${year}`;
    if (holidaysCache[cacheKey]) {
        return holidaysCache[cacheKey];
    }

    const url = `${CALENDAR_API_BASE_URL}PublicHolidays/${year}/${countryCode}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status} for ${url}`);
            // Suppress direct alerts for 404s, console log is usually enough for data absence
            return [];
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            console.error('Unexpected API response format for holidays:', data);
            return [];
        }

        holidaysCache[cacheKey] = data;
        return data;
    } catch (error) {
        console.error('Error fetching holidays:', error);
        alert('Could not fetch holidays. Please check your internet connection or console for more details.');
        return [];
    }
}

async function getHolidaysForMonth(countryCode, year, month) {
    const allYearHolidays = await fetchHolidaysForYear(countryCode, year);
    return allYearHolidays.filter(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate.getMonth() === month;
    });
}

function getHolidaysByDateMap(holidaysArray) {
    const holidaysByDate = {};
    holidaysArray.forEach(holiday => {
        const holidayDate = new Date(holiday.date);
        const dayKey = new Date(holidayDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate()).toDateString();
        if (!holidaysByDate[dayKey]) {
            holidaysByDate[dayKey] = [];
        }
        holidaysByDate[dayKey].push(holiday.name);
    });
    return holidaysByDate;
}

// Function to apply weekly holiday highlighting within a given grid
// This function needs to be aware of holidays in the *entire context* (e.g., quarter)
// It operates on the *rendered DOM elements*
function applyWeeklyHolidayHighlight(parentGrid, year, month, holidaysByDateMap) {
    // Get all 'day' elements, explicitly excluding 'day-header'
    const allRenderedDayElements = Array.from(parentGrid.children).filter(
        element => element.classList.contains('day')
    );

    if (allRenderedDayElements.length === 0) return;

    let currentWeekElements = [];
    let weekHolidayCount = 0;

    const today = new Date();

    // Helper to process a completed week
    const processWeek = (elements, holidayCount, showOnlyHolidayWeeks) => {
        elements.forEach(dayInfo => {
            const element = dayInfo.element;
            element.classList.remove('week-light-green', 'week-dark-green', 'blank-week'); // Clean up old highlights

            // Apply highlighting to actual day elements
            if (holidayCount === 1) {
                element.classList.add('week-light-green');
            } else if (holidayCount > 1) {
                element.classList.add('week-dark-green');
            }

            // Handle "Show Holiday Weeks Only" logic
            if (showOnlyHolidayWeeks && holidayCount === 0) {
                // If a week has no holidays and the filter is on, blank out the day
                element.innerHTML = '';
                element.classList.remove('weekend', 'current-day'); // Remove other classes
                element.classList.add('blank-week'); // Add a class for styling blank weeks
            } else if (showOnlyHolidayWeeks && holidayCount > 0) {
                 // If this week *has* holidays, ensure content is visible for days that were
                 // previously blanked out by the 'day-placeholder-hidden' logic.
                 if (element.classList.contains('day-placeholder-hidden')) {
                    // Re-add content for days that were part of a holiday week but not holidays themselves
                    const dayNumberDiv = document.createElement('div');
                    dayNumberDiv.classList.add('day-number');
                    dayNumberDiv.textContent = dayInfo.date.getDate(); // Use dayInfo.date to get the correct day number
                    element.appendChild(dayNumberDiv);

                    if (dayInfo.date.getDay() === 0 || dayInfo.date.getDay() === 6) {
                        element.classList.add('weekend');
                    }
                    if (dayInfo.date.getFullYear() === today.getFullYear() &&
                        dayInfo.date.getMonth() === today.getMonth() &&
                        dayInfo.date.getDate() === today.getDate()) {
                        element.classList.add('current-day');
                    }
                    // Holiday names would have already been added if the day had a holiday
                    element.classList.remove('day-placeholder-hidden'); // Remove the placeholder class
                 }
            }
        });
    };

    // Iterate through day elements in the grid
    for (let i = 0; i < allRenderedDayElements.length; i++) {
        const dayElement = allRenderedDayElements[i];

        let currentDayDate = null;
        const isFillerDay = dayElement.classList.contains('prev-month') || dayElement.classList.contains('next-month');

        if (!isFillerDay) {
            // For actual days of the current month
            const dayNumber = parseInt(dayElement.querySelector('.day-number').textContent);
            currentDayDate = new Date(year, month, dayNumber);
        } else {
            // For prev/next month filler days, we need to calculate their actual date
            // This requires knowing the number of filler days at the start of the month
            // and the index of the element within the whole set of rendered days.
            const firstDayOfMonth = new Date(year, month, 1);
            const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)

            // The index `i` here is relative to `allRenderedDayElements`, which starts after headers.
            // So, `i` is effectively the 0-indexed day of the first week of the month (including prev-month fillers)
            // A more direct way: the date of the very first day in `allRenderedDayElements`
            // is `firstDayOfMonth - firstDayOfWeek` days.
            const firstRenderedDate = new Date(firstDayOfMonth);
            firstRenderedDate.setDate(firstDayOfMonth.getDate() - firstDayOfWeek);

            currentDayDate = new Date(firstRenderedDate);
            currentDayDate.setDate(firstRenderedDate.getDate() + i);
        }

        const dayKey = currentDayDate ? new Date(currentDayDate.getFullYear(), currentDayDate.getMonth(), currentDayDate.getDate()).toDateString() : null;
        const hasHoliday = dayKey && holidaysByDateMap[dayKey] && holidaysByDateMap[dayKey].length > 0;

        currentWeekElements.push({ element: dayElement, date: currentDayDate }); // Store element and its date
        if (hasHoliday) {
            weekHolidayCount += holidaysByDateMap[dayKey].length;
        }

        // Check if the current day completes a week (Saturday) or if it's the last day element
        if ((currentDayDate && currentDayDate.getDay() === 6) || i === allRenderedDayElements.length - 1) {
            processWeek(currentWeekElements, weekHolidayCount, showHolidayWeeksCheckbox.checked);
            currentWeekElements = [];
            weekHolidayCount = 0;
        }
    }
}


async function renderMonthDays(targetGrid, year, month, holidaysByDateMap, today) {
    targetGrid.innerHTML = '';

    // Add day headers (Sun, Mon, Tue, etc.)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(dayName => {
        const div = document.createElement('div');
        div.classList.add('day-header');
        div.textContent = dayName;
        targetGrid.appendChild(div);
    });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay();

    // Add empty days for the beginning of the week (to align first day of month)
    for (let i = 0; i < firstDayOfWeek; i++) {
        const div = document.createElement('div');
        div.classList.add('day', 'prev-month');
        // Add a placeholder class for days that are initially blanked out by the filter
        if (showHolidayWeeksCheckbox.checked) {
             div.classList.add('day-placeholder-hidden');
        }
        targetGrid.appendChild(div);
    }

    // Render days of the month
    for (let i = 1; i <= daysInMonth; i++) {
        const day = new Date(year, month, i);
        const div = document.createElement('div');
        div.classList.add('day');

        const dayNumberDiv = document.createElement('div');
        dayNumberDiv.classList.add('day-number');
        dayNumberDiv.textContent = i;
        div.appendChild(dayNumberDiv);

        if (day.getDay() === 0 || day.getDay() === 6) {
            div.classList.add('weekend');
        }
        if (day.getFullYear() === today.getFullYear() &&
            day.getMonth() === today.getMonth() &&
            day.getDate() === today.getDate()) {
            div.classList.add('current-day');
        }

        const dayKey = new Date(day.getFullYear(), day.getMonth(), day.getDate()).toDateString();
        if (holidaysByDateMap[dayKey]) {
            const holidayNamesDiv = document.createElement('div');
            holidayNamesDiv.classList.add('holiday-name');
            holidayNamesDiv.innerHTML = holidaysByDateMap[dayKey].map(name => `<span>${name}</span>`).join('<br>');
            div.appendChild(holidayNamesDiv);
        } else {
             // If this day has no holiday, and the filter is on, add a placeholder class
             if (showHolidayWeeksCheckbox.checked) {
                 div.classList.add('day-placeholder-hidden');
             }
        }
        targetGrid.appendChild(div);
    }

    // Add empty days for the end of the week (to fill the grid)
    const totalDaysDisplayed = firstDayOfWeek + daysInMonth;
    const remainingDays = (7 - (totalDaysDisplayed % 7)) % 7;
    for (let i = 0; i < remainingDays; i++) {
        const div = document.createElement('div');
        div.classList.add('day', 'next-month');
        // Add a placeholder class for days that are initially blanked out by the filter
        if (showHolidayWeeksCheckbox.checked) {
             div.classList.add('day-placeholder-hidden');
        }
        targetGrid.appendChild(div);
    }

    // After all days (including fillers) are rendered, apply the highlighting
    applyWeeklyHolidayHighlight(targetGrid, year, month, holidaysByDateMap);
}

async function renderMonthlyCalendar(date) {
    calendarGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';

    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    const selectedCountry = countrySelect.value;

    currentMonthYearSpan.textContent = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // For monthly view, fetch holidays for this month and its direct neighbors to ensure cross-month week highlighting
    // This makes the `holidaysByDateMap` passed to `renderMonthDays` comprehensive enough.
    const holidaysPromises = [];
    holidaysPromises.push(fetchHolidaysForYear(selectedCountry, year)); // Current year
    if (month === 0) { // If January, also fetch previous year's December
        holidaysPromises.push(fetchHolidaysForYear(selectedCountry, year - 1));
    } else if (month === 11) { // If December, also fetch next year's January
        holidaysPromises.push(fetchHolidaysForYear(selectedCountry, year + 1));
    }

    const allYearsHolidaysArrays = await Promise.all(holidaysPromises);
    const allHolidays = allYearsHolidaysArrays.flat(); // Flatten into a single array
    const holidaysByDate = getHolidaysByDateMap(allHolidays);

    renderMonthDays(calendarGrid, year, month, holidaysByDate, today);
}

async function renderQuarterlyCalendar(date) {
    calendarGrid.innerHTML = '';
    calendarGrid.style.gridTemplateColumns = '1fr';

    const year = date.getFullYear();
    const startMonth = date.getMonth();
    const today = new Date();
    const selectedCountry = countrySelect.value;

    const endMonthDate = new Date(year, startMonth + 2, 1);
    const startMonthName = date.toLocaleString('en-US', { month: 'long' });
    const endMonthName = endMonthDate.toLocaleString('en-US', { month: 'long' });
    currentMonthYearSpan.textContent = `${startMonthName} - ${endMonthName} ${year}`;

    // Fetch holidays for the current year and potentially adjacent years if the quarter spans them
    const holidaysPromises = [];
    holidaysPromises.push(fetchHolidaysForYear(selectedCountry, year));
    // If the quarter includes December/January boundary
    if (startMonth <= 0) { // If startMonth is Jan (0) or earlier (e.g., if navigating backward)
        holidaysPromises.push(fetchHolidaysForYear(selectedCountry, year - 1));
    }
    if (startMonth >= 10) { // If startMonth is Nov (10) or Dec (11)
        holidaysPromises.push(fetchHolidaysForYear(selectedCountry, year + 1));
    }

    const allYearsHolidaysArrays = await Promise.all(holidaysPromises);
    const allHolidaysForQuarterContext = allYearsHolidaysArrays.flat();
    const holidaysByDateForQuarter = getHolidaysByDateMap(allHolidaysForQuarterContext);

    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        const month = startMonth + monthOffset;
        const monthDate = new Date(year, month, 1);

        const monthContainer = document.createElement('div');
        monthContainer.classList.add('quarter-month-container');
        calendarGrid.appendChild(monthContainer);

        const monthHeader = document.createElement('h3');
        monthHeader.textContent = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        monthContainer.appendChild(monthHeader);

        const monthGrid = document.createElement('div');
        monthGrid.classList.add('calendar-grid');
        monthContainer.appendChild(monthGrid);

        // Pass the comprehensive holidaysByDateForQuarter map to renderMonthDays
        renderMonthDays(monthGrid, year, month, holidaysByDateForQuarter, today);
    }
}

function renderCalendar() {
    if (currentView === 'monthly') {
        renderMonthlyCalendar(currentDisplayedDate);
    } else {
        renderQuarterlyCalendar(currentDisplayedDate);
    }
}

countrySelect.addEventListener('change', () => {
    holidaysCache = {};
    renderCalendar();
});

prevBtn.addEventListener('click', () => {
    if (currentView === 'monthly') {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() - 1);
    } else {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() - 1);
    }
    renderCalendar();
});

nextBtn.addEventListener('click', () => {
    if (currentView === 'monthly') {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() + 1);
    } else {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() + 1);
    }
    renderCalendar();
});

monthlyViewBtn.addEventListener('click', () => {
    currentView = 'monthly';
    monthlyViewBtn.classList.add('active');
    quarterlyViewBtn.classList.remove('active');
    renderCalendar();
});

quarterlyViewBtn.addEventListener('click', () => {
    currentView = 'quarterly';
    quarterlyViewBtn.classList.add('active');
    monthlyViewBtn.classList.remove('active');
    renderCalendar();
});

showHolidayWeeksCheckbox.addEventListener('change', () => {
    renderCalendar();
});

populateCountries();
