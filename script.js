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

let currentDisplayedDate = new Date(); // Start with current date
let currentView = 'monthly'; // 'monthly' or 'quarterly'
let holidaysCache = {}; // Cache for fetched holidays, keyed by 'countryCode-year'
let countries = []; // Will store the dynamically fetched list of countries

// Function to fetch the full list of available countries from Nager.Date API
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

// Function to populate country dropdown using the fetched list
async function populateCountries() {
    countries = await fetchAvailableCountries(); // Fetch the list of countries
    countrySelect.innerHTML = ''; // Clear existing options

    // Sort countries alphabetically by name before populating the dropdown
    countries.sort((a, b) => a.name.localeCompare(b.name));

    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.countryCode; // Use 'countryCode' for the option value
        option.textContent = country.name; // Use 'name' for the option text
        countrySelect.appendChild(option);
    });

    // Set a default country after populating
    countrySelect.value = 'US'; // Try to set 'US' as default
    if (!countrySelect.value && countries.length > 0) {
        countrySelect.value = countries[0].countryCode; // Fallback to the first country if 'US' isn't found
    }

    // After populating the dropdown, render the calendar for the initial country
    renderCalendar();
}

// Function to fetch holidays for a specific country and year from Nager.Date API
// Nager.Date 'PublicHolidays' endpoint returns ALL public holidays for the year.
// This API does NOT require an API key.
async function fetchHolidaysForYear(countryCode, year) {
    const cacheKey = `${countryCode}-${year}`;
    if (holidaysCache[cacheKey]) {
        return holidaysCache[cacheKey];
    }

    const url = `${CALENDAR_API_BASE_URL}PublicHolidays/${year}/${countryCode}`;

    try {
        const response = await fetch(url); // No headers needed for Nager.Date API

        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status} for ${url}`);
            if (response.status === 404) {
                 alert(`No holiday data available for ${countryCode} in ${year}.`);
            } else {
                 alert(`Error fetching holidays. HTTP status: ${response.status}. Check console for details.`);
            }
            return [];
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) {
            console.error('Unexpected API response format for holidays:', data);
            alert('Unexpected data format from holiday API.');
            return [];
        }
        
        holidaysCache[cacheKey] = data; // Cache the full year's data
        return data;
    } catch (error) {
        console.error('Error fetching holidays:', error);
        alert('Could not fetch holidays. Please check your internet connection or console for more details.');
        return [];
    }
}

// Helper to get holidays for a specific month from the cached annual data
async function getHolidaysForMonth(countryCode, year, month) {
    const allYearHolidays = await fetchHolidaysForYear(countryCode, year);
    // Nager.Date date format is 'YYYY-MM-DD'
    return allYearHolidays.filter(holiday => {
        const holidayDate = new Date(holiday.date); // Date string is directly 'YYYY-MM-DD'
        return holidayDate.getMonth() === month; // month is 0-indexed (0 for Jan, 11 for Dec)
    });
}

// Function to render the calendar (monthly view)
async function renderMonthlyCalendar(date) {
    calendarGrid.innerHTML = ''; // Clear previous days

    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const today = new Date();
    const selectedCountry = countrySelect.value;

    currentMonthYearSpan.textContent = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Add day headers (Sun, Mon, Tue, etc.)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(dayName => {
        const div = document.createElement('div');
        div.classList.add('day-header');
        div.textContent = dayName;
        calendarGrid.appendChild(div);
    });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 6 for Saturday

    // Add empty days for the beginning of the week (to align first day of month)
    for (let i = 0; i < firstDayOfWeek; i++) {
        const div = document.createElement('div');
        div.classList.add('day', 'prev-month'); // Use 'prev-month' class for styling
        calendarGrid.appendChild(div);
    }

    // Fetch and filter holidays for the current month
    const holidays = await getHolidaysForMonth(selectedCountry, year, month);

    // Organize holidays by their date for easy lookup
    const holidaysByDate = {};
    holidays.forEach(holiday => {
        const holidayDate = new Date(holiday.date); // Nager.Date 'date' property is 'YYYY-MM-DD'
        // Normalize to local date string for consistent keys, ignoring time
        const dayKey = new Date(holidayDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate()).toDateString();
        if (!holidaysByDate[dayKey]) {
            holidaysByDate[dayKey] = [];
        }
        holidaysByDate[dayKey].push(holiday.name); // Nager.Date uses 'name' for holiday name
    });

    // Render days of the month
    for (let i = 1; i <= daysInMonth; i++) {
        const day = new Date(year, month, i);
        const div = document.createElement('div');
        div.classList.add('day');

        // Create a separate div for the day number to allow independent styling/positioning
        const dayNumberDiv = document.createElement('div');
        dayNumberDiv.classList.add('day-number');
        dayNumberDiv.textContent = i;
        div.appendChild(dayNumberDiv); // Append day number first

        // Add 'weekend' class for Saturdays and Sundays
        if (day.getDay() === 0 || day.getDay() === 6) {
            div.classList.add('weekend');
        }
        // Add 'current-day' class if it's today's date
        if (day.getFullYear() === today.getFullYear() &&
            day.getMonth() === today.getMonth() &&
            day.getDate() === today.getDate()) {
            div.classList.add('current-day');
        }

        // Add holiday names if there are any for this day
        const dayKey = day.toDateString();
        if (holidaysByDate[dayKey]) {
            const holidayNamesDiv = document.createElement('div');
            holidayNamesDiv.classList.add('holiday-name');
            // Display all holidays for the day, separated by a line break
            holidayNamesDiv.innerHTML = holidaysByDate[dayKey].map(name => `<span>${name}</span>`).join('<br>');
            div.appendChild(holidayNamesDiv); // Append holiday names second
        }
        calendarGrid.appendChild(div);
    }

    // Add empty days for the end of the week (to fill the grid)
    const totalDaysDisplayed = firstDayOfWeek + daysInMonth;
    const remainingDays = (7 - (totalDaysDisplayed % 7)) % 7;
    for (let i = 0; i < remainingDays; i++) {
        const div = document.createElement('div');
        div.classList.add('day', 'next-month'); // Use 'next-month' class for styling
        calendarGrid.appendChild(div);
    }

    // Apply the weekly holiday highlighting
    applyWeeklyHolidayHighlight(calendarGrid, year, month, holidaysByDate);
}

// Function to render the calendar (rolling quarterly view)
async function renderQuarterlyCalendar(date) {
    calendarGrid.innerHTML = ''; // Clear previous months
    calendarGrid.style.gridTemplateColumns = '1fr'; // Adjust grid for stacked months in quarterly view

    const year = date.getFullYear();
    const startMonth = date.getMonth(); // This will be the first month of our rolling quarter (0-indexed)
    const today = new Date();
    const selectedCountry = countrySelect.value;

    // --- Dynamic Quarter Title ---
    const endMonthDate = new Date(year, startMonth + 2, 1); // Get the date for the 3rd month in the quarter
    const startMonthName = date.toLocaleString('en-US', { month: 'long' });
    const endMonthName = endMonthDate.toLocaleString('en-US', { month: 'long' });
    currentMonthYearSpan.textContent = `${startMonthName} - ${endMonthName} ${year}`;
    // --- End Dynamic Quarter Title ---


    // Fetch ALL holidays for the entire year once, then filter per month (efficiency)
    const allYearHolidays = await fetchHolidaysForYear(selectedCountry, year);

    // Map all year holidays to holidaysByDate for easy lookup across the quarter
    const holidaysByDateForQuarter = {};
    allYearHolidays.forEach(holiday => {
        const holidayDate = new Date(holiday.date);
        const dayKey = new Date(holidayDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate()).toDateString();
        if (!holidaysByDateForQuarter[dayKey]) {
            holidaysByDateForQuarter[dayKey] = [];
        }
        holidaysByDateForQuarter[dayKey].push(holiday.name);
    });

    // Render each month in the rolling quarter (3 months)
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        const month = startMonth + monthOffset;
        const monthDate = new Date(year, month, 1); // Create a date object for the current month in the loop

        const monthContainer = document.createElement('div');
        monthContainer.classList.add('quarter-month-container');
        calendarGrid.appendChild(monthContainer);

        const monthHeader = document.createElement('h3');
        monthHeader.textContent = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        monthContainer.appendChild(monthHeader);

        const monthGrid = document.createElement('div');
        monthGrid.classList.add('calendar-grid'); // Re-use calendar-grid for inner months
        monthContainer.appendChild(monthGrid);

        // Add day headers for each month
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(dayName => {
            const div = document.createElement('div');
            div.classList.add('day-header');
            div.textContent = dayName;
            monthGrid.appendChild(div);
        });

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const firstDayOfWeek = firstDayOfMonth.getDay();

        // Add empty days for the beginning of the week
        for (let i = 0; i < firstDayOfWeek; i++) {
            const div = document.createElement('div');
            div.classList.add('day', 'prev-month');
            monthGrid.appendChild(div);
        }

        // Render days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const day = new Date(year, month, i);
            const div = document.createElement('div');
            div.classList.add('day');

            // Create a separate div for the day number
            const dayNumberDiv = document.createElement('div');
            dayNumberDiv.classList.add('day-number');
            dayNumberDiv.textContent = i;
            div.appendChild(dayNumberDiv); // Append day number first

            if (day.getDay() === 0 || day.getDay() === 6) {
                div.classList.add('weekend');
            }
            if (day.getFullYear() === today.getFullYear() &&
                day.getMonth() === today.getMonth() &&
                day.getDate() === today.getDate()) {
                div.classList.add('current-day');
            }

            const dayKey = day.toDateString();
            if (holidaysByDateForQuarter[dayKey]) {
                const holidayNamesDiv = document.createElement('div');
                holidayNamesDiv.classList.add('holiday-name');
                holidayNamesDiv.innerHTML = holidaysByDateForQuarter[dayKey].map(name => `<span>${name}</span>`).join('<br>');
                div.appendChild(holidayNamesDiv); // Append holiday names second
            }
            monthGrid.appendChild(div);
        }

        const totalDaysDisplayed = firstDayOfWeek + daysInMonth;
        const remainingDays = (7 - (totalDaysDisplayed % 7)) % 7;
        for (let i = 0; i < remainingDays; i++) {
            const div = document.createElement('div');
            div.classList.add('day', 'next-month');
            monthGrid.appendChild(div);
        }
        // Apply highlighting for this specific month's grid using the quarter's total holidays
        applyWeeklyHolidayHighlight(monthGrid, year, month, holidaysByDateForQuarter);
    }
}

// Function to apply weekly holiday highlighting
function applyWeeklyHolidayHighlight(parentGrid, year, month, holidaysByDate) {
    const daysInGrid = Array.from(parentGrid.querySelectorAll('.day:not(.prev-month):not(.next-month)'));

    if (daysInGrid.length === 0) return;

    let currentWeekDays = [];
    for (let i = 0; i < daysInGrid.length; i++) {
        const dayElement = daysInGrid[i];
        const dayNumberElement = dayElement.querySelector('.day-number'); 
        if (!dayNumberElement) continue; 
        const dayNumber = parseInt(dayNumberElement.textContent);
        if (isNaN(dayNumber)) continue;

        const currentDayDate = new Date(year, month, dayNumber);
        currentWeekDays.push({ element: dayElement, date: currentDayDate });

        if (currentDayDate.getDay() === 6 || i === daysInGrid.length - 1) {
            let holidayCountInWeek = 0;
            currentWeekDays.forEach(dayInfo => {
                const dayKey = new Date(dayInfo.date.getFullYear(), dayInfo.date.getMonth(), dayInfo.date.getDate()).toDateString();
                if (holidaysByDate[dayKey] && holidaysByDate[dayKey].length > 0) {
                    holidayCountInWeek += holidaysByDate[dayKey].length;
                }
            });

            currentWeekDays.forEach(elementInfo => {
                const element = elementInfo.element;
                element.classList.remove('week-light-green', 'week-dark-green'); 
                if (holidayCountInWeek === 1) {
                    element.classList.add('week-light-green');
                } else if (holidayCountInWeek > 1) {
                    element.classList.add('week-dark-green');
                }
            });

            currentWeekDays = []; 
        }
    }
}

// Initial render based on current view
function renderCalendar() {
    if (currentView === 'monthly') {
        calendarGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        renderMonthlyCalendar(currentDisplayedDate);
    } else {
        renderQuarterlyCalendar(currentDisplayedDate);
    }
}

// Event Listeners
countrySelect.addEventListener('change', () => {
    holidaysCache = {}; // Clear cache when country changes
    renderCalendar();
});

prevBtn.addEventListener('click', () => {
    if (currentView === 'monthly') {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() - 1);
    } else {
        // For rolling quarter, go back by 1 month
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() - 1);
    }
    renderCalendar();
});

nextBtn.addEventListener('click', () => {
    if (currentView === 'monthly') {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() + 1);
    } else {
        // For rolling quarter, go forward by 1 month
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

// Initialize the application by populating countries and then rendering the calendar
populateCountries();