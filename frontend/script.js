// ═══════════════════════════════════════════════════════════════
//  DataXplore — Frontend Controller
// ═══════════════════════════════════════════════════════════════
const API = "/api";

const PALETTE = [
    "#4f46e5", "#0891b2", "#10b981", "#f59e0b", "#f43f5e",
    "#8b5cf6", "#06b6d4", "#22c55e", "#eab308", "#ec4899",
    "#6366f1", "#14b8a6", "#84cc16", "#f97316", "#d946ef",
];

const PALETTE_ALPHA = PALETTE.map((c) => c + "bb");

// ─── Helpers ──────────────────────────────────────────
function fmt(n) {
    if (n == null || isNaN(n)) return "0";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function axisFmt() {
    return { callback: (v) => fmt(v) };
}

const BASE_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: "#0f172a",
            titleFont: { family: "Inter", weight: "600", size: 13 },
            bodyFont: { family: "Inter", size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
                label: (ctx) => " " + fmt(ctx.parsed.y ?? ctx.parsed.r ?? ctx.raw),
            },
        },
    },
    scales: {
        x: {
            grid: { display: false },
            ticks: { font: { family: "Inter", size: 11, weight: "500" }, color: "#94a3b8" },
        },
        y: {
            grid: { color: "#f1f5f9" },
            ticks: { font: { family: "Inter", size: 11, weight: "500" }, color: "#94a3b8" },
        },
    },
};

// ─── Init ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    let data = null;
    try {
        const res = await fetch(`${API}/eda_stats`);
        if (res.ok) data = await res.json();
    } catch (e) {
        console.error("API unreachable:", e);
    }

    if (document.getElementById("quick-stats")) initHome(data);
    else if (document.getElementById("chart1")) initAnalytics(data);
});

// ═══════════════════════════════════════════════════════════════
//  HOME PAGE
// ═══════════════════════════════════════════════════════════════
function initHome(data) {
    if (!data) {
        document.getElementById("quick-stats").innerHTML =
            '<div class="card stat-box"><div class="val">—</div><div class="lbl">Awaiting API</div></div>'.repeat(3);
        return;
    }

    const s = data.summary["Population (Est.)"] || {};
    const sa = data.summary["Area (sq km)"] || {};

    document.getElementById("quick-stats").innerHTML = `
        <div class="card stat-box"><div class="val">${Math.round(s.count || 0)}</div><div class="lbl">Total Cities</div></div>
        <div class="card stat-box"><div class="val">${fmt(s.mean || 0)}</div><div class="lbl">Avg Population</div></div>
        <div class="card stat-box"><div class="val">${fmt(sa.mean || 0)}</div><div class="lbl">Avg Area km²</div></div>
    `;

    // Model metrics
    const mp = data.model_performance;
    const reg = mp.regression || {};
    const clf = mp.classification || {};
    document.getElementById("m-r2").textContent = (reg.r2_score ?? "—").toString();
    document.getElementById("m-cv").textContent =
        reg.cv_r2_mean != null ? `${reg.cv_r2_mean}±${reg.cv_r2_std}` : "—";
    document.getElementById("m-acc").textContent =
        clf.accuracy != null ? (clf.accuracy * 100).toFixed(1) + "%" : "—";
    document.getElementById("m-feat").textContent =
        reg.features ? reg.features.length.toString() : "—";

    // Home chart — top 5 bar
    const top5 = data.charts.top_10_pop.slice(0, 5);
    new Chart(document.getElementById("homeChart"), {
        type: "bar",
        data: {
            labels: top5.map((d) => d.City),
            datasets: [{
                data: top5.map((d) => d["Population (Est.)"]),
                backgroundColor: PALETTE.slice(0, 5),
                borderRadius: 8,
                borderSkipped: false,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                ...BASE_OPTS.scales,
                y: { ...BASE_OPTS.scales.y, beginAtZero: true, ticks: { ...BASE_OPTS.scales.y.ticks, ...axisFmt() } },
                x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxRotation: 30 } },
            },
        },
    });
}

// ═══════════════════════════════════════════════════════════════
//  ANALYTICS PAGE — 8 CHARTS
// ═══════════════════════════════════════════════════════════════
function initAnalytics(data) {
    if (!data) {
        document.querySelector(".charts-grid").innerHTML =
            '<div class="card" style="grid-column:1/-1;text-align:center;padding:4rem;"><h4>API Unavailable</h4><p class="text-muted">Start the backend server to load live data.</p></div>';
        return;
    }

    const c = data.charts;

    // ── 1. Top 10 Population Bar ──
    new Chart(document.getElementById("chart1"), {
        type: "bar",
        data: {
            labels: c.top_10_pop.map((d) => d.City),
            datasets: [{
                data: c.top_10_pop.map((d) => d["Population (Est.)"]),
                backgroundColor: PALETTE[0],
                borderRadius: 6,
                borderSkipped: false,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                ...BASE_OPTS.scales,
                y: { ...BASE_OPTS.scales.y, beginAtZero: true, ticks: { ...BASE_OPTS.scales.y.ticks, ...axisFmt() } },
                x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxRotation: 40, font: { size: 10 } } },
            },
        },
    });

    // ── 2. Country Distribution (Horizontal Bar) ──
    const cEntries = Object.entries(c.country_dist).sort((a, b) => a[1] - b[1]);
    new Chart(document.getElementById("chart2"), {
        type: "bar",
        data: {
            labels: cEntries.map((e) => e[0]),
            datasets: [{
                data: cEntries.map((e) => e[1]),
                backgroundColor: PALETTE.slice(0, cEntries.length),
                borderRadius: 6,
                borderSkipped: false,
            }],
        },
        options: {
            ...BASE_OPTS,
            indexAxis: "y",
            scales: {
                x: { ...BASE_OPTS.scales.x, beginAtZero: true, ticks: { ...BASE_OPTS.scales.x.ticks, stepSize: 1 } },
                y: { ...BASE_OPTS.scales.y, grid: { display: false } },
            },
        },
    });

    // ── 3. Size Category Doughnut ──
    new Chart(document.getElementById("chart3"), {
        type: "doughnut",
        data: {
            labels: Object.keys(c.size_dist),
            datasets: [{
                data: Object.values(c.size_dist),
                backgroundColor: [PALETTE[0], PALETTE[3], PALETTE[4]],
                borderWidth: 0,
                hoverOffset: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { family: "Inter", size: 12, weight: "600" }, color: "#475569" },
                },
                tooltip: BASE_OPTS.plugins.tooltip,
            },
        },
    });

    // ── 4. Area vs Population Scatter ──
    new Chart(document.getElementById("chart4"), {
        type: "scatter",
        data: {
            datasets: [{
                data: c.scatter.map((d) => ({ x: d["Area (sq km)"], y: d["Population (Est.)"] })),
                backgroundColor: PALETTE_ALPHA[1],
                borderColor: PALETTE[1],
                borderWidth: 1.5,
                pointRadius: 5,
                pointHoverRadius: 8,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, title: { display: true, text: "Area (sq km)", font: { family: "Inter", size: 12, weight: "600" }, color: "#64748b" }, ticks: { ...BASE_OPTS.scales.x.ticks, ...axisFmt() } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: "Population", font: { family: "Inter", size: 12, weight: "600" }, color: "#64748b" }, ticks: { ...BASE_OPTS.scales.y.ticks, ...axisFmt() } },
            },
            plugins: {
                ...BASE_OPTS.plugins,
                tooltip: {
                    ...BASE_OPTS.plugins.tooltip,
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            return c.scatter[idx]?.City || "";
                        },
                        label: (ctx) => ` Area: ${fmt(ctx.parsed.x)}  Pop: ${fmt(ctx.parsed.y)}`,
                    },
                },
            },
        },
    });

    // ── 5. Population Histogram ──
    new Chart(document.getElementById("chart5"), {
        type: "bar",
        data: {
            labels: c.pop_histogram.map((d) => d.bin),
            datasets: [{
                data: c.pop_histogram.map((d) => d.count),
                backgroundColor: PALETTE[2] + "99",
                borderColor: PALETTE[2],
                borderWidth: 1.5,
                borderRadius: 4,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                ...BASE_OPTS.scales,
                y: { ...BASE_OPTS.scales.y, beginAtZero: true, title: { display: true, text: "Frequency", font: { family: "Inter", size: 11, weight: "600" }, color: "#64748b" }, ticks: { ...BASE_OPTS.scales.y.ticks, stepSize: 1 } },
                x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxRotation: 45, font: { size: 9 } } },
            },
        },
    });

    // ── 6. Density Leaders Bar ──
    new Chart(document.getElementById("chart6"), {
        type: "bar",
        data: {
            labels: c.density_leaders.map((d) => d.City),
            datasets: [{
                data: c.density_leaders.map((d) => d["Density (pop/sq km)"]),
                backgroundColor: PALETTE[5],
                borderRadius: 6,
                borderSkipped: false,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                ...BASE_OPTS.scales,
                y: { ...BASE_OPTS.scales.y, beginAtZero: true, ticks: { ...BASE_OPTS.scales.y.ticks, ...axisFmt() } },
                x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxRotation: 40, font: { size: 10 } } },
            },
        },
    });

    // ── 7. Area Histogram ──
    new Chart(document.getElementById("chart7"), {
        type: "bar",
        data: {
            labels: c.area_histogram.map((d) => d.bin),
            datasets: [{
                data: c.area_histogram.map((d) => d.count),
                backgroundColor: PALETTE[8] + "99",
                borderColor: PALETTE[8],
                borderWidth: 1.5,
                borderRadius: 4,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                ...BASE_OPTS.scales,
                y: { ...BASE_OPTS.scales.y, beginAtZero: true, title: { display: true, text: "Frequency", font: { family: "Inter", size: 11, weight: "600" }, color: "#64748b" }, ticks: { ...BASE_OPTS.scales.y.ticks, stepSize: 1 } },
                x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxRotation: 45, font: { size: 9 } } },
            },
        },
    });

    // ── 8. Population vs Density Scatter ──
    new Chart(document.getElementById("chart8"), {
        type: "scatter",
        data: {
            datasets: [{
                data: c.pop_vs_density.map((d) => ({
                    x: d["Population (Est.)"],
                    y: d["Density (pop/sq km)"],
                })),
                backgroundColor: PALETTE_ALPHA[9],
                borderColor: PALETTE[9],
                borderWidth: 1.5,
                pointRadius: 6,
                pointHoverRadius: 9,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, title: { display: true, text: "Population", font: { family: "Inter", size: 12, weight: "600" }, color: "#64748b" }, ticks: { ...BASE_OPTS.scales.x.ticks, ...axisFmt() } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: "Density (pop/sq km)", font: { family: "Inter", size: 12, weight: "600" }, color: "#64748b" }, ticks: { ...BASE_OPTS.scales.y.ticks, ...axisFmt() } },
            },
            plugins: {
                ...BASE_OPTS.plugins,
                tooltip: {
                    ...BASE_OPTS.plugins.tooltip,
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            return c.pop_vs_density[idx]?.City || "";
                        },
                        label: (ctx) => ` Pop: ${fmt(ctx.parsed.x)}  Density: ${fmt(ctx.parsed.y)}/km²`,
                    },
                },
            },
        },
    });
}

// ═══════════════════════════════════════════════════════════════
//  PREDICTIONS PAGE
// ═══════════════════════════════════════════════════════════════
async function predictPopulation() {
    const input = document.getElementById("areaInput");
    const box = document.getElementById("predictionResult");
    const area = parseFloat(input.value);

    if (!area || area <= 0) {
        input.focus();
        return;
    }

    box.classList.remove("hidden");
    box.innerHTML = `<span class="loading-pulse"></span> Running regression model...`;

    try {
        const res = await fetch(`${API}/predict/population?area=${area}`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        box.innerHTML = `
            <span class="section-label">Regression Output</span>
            <div class="result-value">${fmt(data.result)}</div>
            <div class="result-unit">${data.unit} for ${fmt(data.area)} km² area</div>
        `;
    } catch (e) {
        box.innerHTML = `<div style="color:var(--danger);font-weight:600;">Connection failed — is the backend running?</div>`;
    }
}

async function predictSize() {
    const input = document.getElementById("areaInput");
    const box = document.getElementById("predictionResult");
    const area = parseFloat(input.value);

    if (!area || area <= 0) {
        input.focus();
        return;
    }

    box.classList.remove("hidden");
    box.innerHTML = `<span class="loading-pulse"></span> Running classifier...`;

    try {
        const res = await fetch(`${API}/predict/size?area=${area}`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        const color = data.result === "Mega City" ? "var(--danger)"
            : data.result === "Large City" ? "var(--warning)" : "var(--success)";
        box.innerHTML = `
            <span class="section-label">Classification Output</span>
            <div class="result-value" style="color:${color}">${data.result}</div>
            <div class="result-unit">${data.unit} for ${fmt(data.area)} km² area</div>
        `;
    } catch (e) {
        box.innerHTML = `<div style="color:var(--danger);font-weight:600;">Connection failed — is the backend running?</div>`;
    }
}

// Allow Enter key to trigger population prediction
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.getElementById("areaInput") === document.activeElement) {
        predictPopulation();
    }
});