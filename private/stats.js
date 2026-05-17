(function () {
    "use strict";

    var data = window.statsData || {};

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }

    setText('aggregatorTotal', data.aggregatorTotal || 0);
    setText('randomTotal', data.randomTotal || 0);

    var labels = data.labels || [];

    // Daily activity — three datasets sharing the same UTC-date axis.
    new Chart(document.getElementById('timeSeriesChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Page loads', data: data.pageLoads || [], borderColor: '#1f77b4', backgroundColor: 'rgba(31,119,180,0.1)', tension: 0.2, pointRadius: 0, borderWidth: 2 },
                { label: 'Unique visitors', data: data.uniqueVisitors || [], borderColor: '#2ca02c', backgroundColor: 'rgba(44,160,44,0.1)', tension: 0.2, pointRadius: 0, borderWidth: 2 },
                { label: 'Queries', data: data.queries || [], borderColor: '#d62728', backgroundColor: 'rgba(214,39,40,0.1)', tension: 0.2, pointRadius: 0, borderWidth: 2 }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 12, autoSkip: true } },
                y: { beginAtZero: true, ticks: { precision: 0 } }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    new Chart(document.getElementById('histogramChart'), {
        type: 'bar',
        data: {
            labels: data.histogramBins || [],
            datasets: [{
                label: 'Visitors',
                data: data.histogramCounts || [],
                backgroundColor: '#1f77b4'
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'Queries made' } },
                y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Visitors' } }
            },
            plugins: { legend: { display: false } }
        }
    });

    var tbody = document.getElementById('recentQueriesBody');
    var empty = document.getElementById('recentQueriesEmpty');
    var recent = data.recentQueries || [];
    if (!recent.length) {
        if (empty) empty.style.display = '';
    } else {
        recent.forEach(function (row) {
            var tr = document.createElement('tr');
            var tdT = document.createElement('td');
            tdT.className = 't';
            tdT.textContent = (row.t || '').replace('T', ' ').replace(/\..*$/, '');
            var tdQ = document.createElement('td');
            tdQ.className = 'q';
            tdQ.textContent = row.q || '';
            tr.appendChild(tdT);
            tr.appendChild(tdQ);
            tbody.appendChild(tr);
        });
    }
})();
