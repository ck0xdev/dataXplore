const API_BASE = "http://localhost:8000/api";

// Initial Load
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch(`${API_BASE}/eda_stats`);
        const data = await response.json();

        // Populate stats
        renderSummaryStats(data.summary);

        // Render all charts
        renderQuickBarChart(data.top_10); // on Dashboard
        renderBarChart(data.top_10); // on Charts View
        renderPieChart(data.country_distribution);
        renderScatterChart(data.scatter);
        renderPolarChart(data.size_distribution);
        renderLineChart(data.line_data);

    } catch (error) {
        console.error("Error loading EDA stats:", error);
    }
});

// App Tab Navigation Logic (iOS Style)
function switchTab(tabId, el) {
    // Hide all tabs
    document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
    // Un-highlight all nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show selected tab
    document.getElementById('view-' + tabId).classList.add('active');
    el.classList.add('active');

    // Update Title
    const titles = {
        'dashboard': 'Dashboard',
        'charts': 'Charts & EDA',
        'predict': 'ML Predict'
    };
    document.getElementById('screen-title').textContent = titles[tabId];
}

// Utility: Format large numbers
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return isNaN(num) ? 0 : num;
}

function renderSummaryStats(summary) {
    const statsDiv = document.getElementById("stats-summary");

    const count = summary['Population (Est.)']?.count || 0;
    const avgPop = summary['Population (Est.)']?.mean || 0;
    const avgArea = summary['Area (sq km)']?.mean || 0;
    const maxDensity = (summary['Density (pop/sq km)']?.max || 0).toFixed(0);

    statsDiv.innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${count}</div>
            <div class="stat-label">Total Cities</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${formatNumber(avgPop)}</div>
            <div class="stat-label">Avg Population</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${formatNumber(avgArea)}</div>
            <div class="stat-label">Avg Area (sq km)</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${maxDensity}</div>
            <div class="stat-label">Max Density (pop/sq km)</div>
        </div>
    `;
}

// Global Chart settings mimicking Apple design
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#8e8e93';

const iosColors = [
    '#007aff', '#ff9500', '#ff2d55', '#4cd964', '#5856d6',
    '#ffcc00', '#5ac8fa', '#ff3b30'
];

function renderQuickBarChart(top10Data) {
    const ctx = document.getElementById('quickBarChart').getContext('2d');
    const top5 = top10Data.slice(0, 5);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top5.map(d => d.City),
            datasets: [{
                label: 'Population (Millions)',
                data: top5.map(d => d['Population (Est.)']),
                backgroundColor: '#007aff',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `Population: ${formatNumber(ctx.raw)}` } }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Population (Millions)' },
                    ticks: { callback: v => formatNumber(v) }
                }
            }
        }
    });
}

function renderBarChart(top10Data) {
    const ctx = document.getElementById('barChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10Data.map(d => d.City),
            datasets: [{
                label: 'Population (Millions)',
                data: top10Data.map(d => d['Population (Est.)']),
                backgroundColor: '#5856d6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `Population: ${formatNumber(ctx.raw)}` } }
            },
            indexAxis: 'y', // Horizontal bar for easier reading on mobile
            scales: {
                x: {
                    title: { display: true, text: 'Population (Millions)' },
                    ticks: { callback: v => formatNumber(v) }
                }
            }
        }
    });
}

function renderPieChart(countryData) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(countryData),
            datasets: [{
                data: Object.values(countryData),
                backgroundColor: iosColors,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Number of Megacities per Country' },
                legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} Cities` } }
            }
        }
    });
}

function renderScatterChart(scatterData) {
    const ctx = document.getElementById('scatterChart').getContext('2d');

    const mappedData = scatterData.map(d => ({
        x: d['Area (sq km)'],
        y: d['Population (Est.)'],
        cityName: d.City
    }));

    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Cities',
                data: mappedData,
                backgroundColor: 'rgba(255, 45, 85, 0.7)',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const pt = context.raw;
                            return `${pt.cityName} (Area: ${formatNumber(pt.x)} sq km, Pop: ${formatNumber(pt.y)})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Land Area (sq km)' },
                    ticks: { callback: v => formatNumber(v) }
                },
                y: {
                    title: { display: true, text: 'Population (Millions)' },
                    ticks: { callback: v => formatNumber(v) }
                }
            }
        }
    });
}

function renderPolarChart(sizeData) {
    const ctx = document.getElementById('polarChart').getContext('2d');
    new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: Object.keys(sizeData),
            datasets: [{
                data: Object.values(sizeData),
                backgroundColor: [
                    'rgba(0, 122, 255, 0.6)',
                    'rgba(76, 217, 100, 0.6)',
                    'rgba(255, 149, 0, 0.6)'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Number of Cities in each Size Category' },
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} Cities` } }
            }
        }
    });
}

function renderLineChart(lineData) {
    const ctx = document.getElementById('lineChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: lineData.map(d => d.City),
            datasets: [
                {
                    label: 'Population (Millions)',
                    data: lineData.map(d => d['Population (Est.)']),
                    borderColor: '#ff2d55',
                    backgroundColor: 'rgba(255, 45, 85, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Density (Pop per sq km)',
                    data: lineData.map(d => d['Density (pop/sq km)']),
                    borderColor: '#4cd964',
                    borderDash: [5, 5],
                    yAxisID: 'y1',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            if (ctx.datasetIndex === 0) return `Population: ${formatNumber(ctx.raw)}`;
                            if (ctx.datasetIndex === 1) return `Density: ${formatNumber(ctx.raw)} / sq km`;
                        }
                    }
                }
            },
            scales: {
                x: { display: false }, // Hide x labels to save space
                y: {
                    type: 'linear', display: true, position: 'left',
                    title: { display: true, text: 'Population (Millions)' },
                    ticks: { callback: v => formatNumber(v) }
                },
                y1: {
                    type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Density (pop/sq km)' },
                    ticks: { callback: v => formatNumber(v) }
                }
            }
        }
    });
}

// Validation helper
function validateInput(areaValue, resultBox) {
    if (!areaValue || isNaN(areaValue) || areaValue <= 0) {
        resultBox.textContent = "Please enter a valid area number.";
        resultBox.className = "result-card error";
        return false;
    }
    return true;
}

// Predictions API Calls
async function predictPopulation() {
    const area = document.getElementById('areaInput').value;
    const resBox = document.getElementById('predictionResult');

    if (!validateInput(area, resBox)) return;

    resBox.textContent = "Connecting to ML Engine...";
    resBox.className = "result-card"; // reset style

    try {
        const response = await fetch(`${API_BASE}/predict/population?area=${area}`);
        if (!response.ok) throw new Error("Server error");

        const data = await response.json();
        const pred = formatNumber(data.predicted_population);

        resBox.innerHTML = `<strong>Estimated Population:</strong><br><span style="font-size:24px; color:#007aff;">~${pred}</span>`;
        resBox.className = "result-card";
    } catch (e) {
        resBox.textContent = "Prediction failed. Check backend connection.";
        resBox.className = "result-card error";
    }
}

async function predictSize() {
    const area = document.getElementById('areaInput').value;
    const resBox = document.getElementById('predictionResult');

    if (!validateInput(area, resBox)) return;

    resBox.textContent = "Connecting to ML Engine...";
    resBox.className = "result-card"; // reset style

    try {
        const response = await fetch(`${API_BASE}/predict/size?area=${area}`);
        if (!response.ok) throw new Error("Server error");

        const data = await response.json();
        const sizeCat = data.predicted_size_category;

        resBox.innerHTML = `<strong>Predicted Classification:</strong><br><span style="font-size:24px; color:#5856d6;">${sizeCat}</span>`;
        resBox.className = "result-card";
    } catch (e) {
        resBox.textContent = "Prediction failed. Check backend connection.";
        resBox.className = "result-card error";
    }
}
