(() => {
  'use strict';
  const data = window.DEGREE_RESULTS_DATA.modules.filter(r => r.level === 'Level 5');
  const years = [...new Set(data.map(r => r.year))].sort();
  const el = id => document.querySelector(`#${id}`);
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = r => r.code || r.module;
  const pct = n => `${n.toFixed(1)}%`;
  const changeLabel = n => n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)} pp`;
  function counts(records) {
    const marks = records.flatMap(r => r.marks);
    const fails = marks.filter(x => x < 40).length;
    return {n: marks.length, fails, rate: marks.length ? fails / marks.length * 100 : 0,
      near: marks.filter(x => x >= 30 && x < 40).length};
  }
  function rows(year) {
    return data.filter(r => r.year === year).map(r => {
      const history = data.filter(x => key(x) === key(r));
      const previous = history.filter(x => x.year < year).sort((a,b) => b.year.localeCompare(a.year))[0];
      const current = counts([r]);
      return {...r, ...current, history: counts(history), previousYear: previous?.year || '',
        change: previous ? current.rate - counts([previous]).rate : null};
    });
  }
  function ranked(year, sort) {
    return rows(year).sort((a,b) => (sort === 'change' ? (b.change ?? -Infinity) - (a.change ?? -Infinity) : b[sort] - a[sort]) || b.fails - a.fails || a.module.localeCompare(b.module));
  }
  el('progressionYear').innerHTML = years.map(y => `<option>${escape(y)}</option>`).join('');
  el('progressionYear').value = years.at(-1);
  function render() {
    const year = el('progressionYear').value;
    const records = ranked(year, el('progressionSort').value || 'fails');
    const byCount = ranked(year, 'fails');
    const total = counts(data.filter(r => r.year === year));
    const priorYear = years[years.indexOf(year) - 1];
    const prior = priorYear ? counts(data.filter(r => r.year === priorYear)) : null;
    const leaders = byCount.slice(0,3);
    const leadFailures = leaders.reduce((sum,r) => sum + r.fails, 0);
    el('progressionKpis').innerHTML = [['Included module results',total.n],['Failed module results',total.fails],['Pooled failure rate',pct(total.rate)],['Descriptive change (pp)',changeLabel(prior ? total.rate - prior.rate : null)]].map(([label,value]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`).join('');
    el('progressionHeadline').innerHTML = `<p><strong>${escape(year)}:</strong> ${total.fails} of ${total.n} included module results in our review fall below 40 (${pct(total.rate)}). ${year === "2025/2026" ? "These are post-resit results with workbook summary rows excluded." : "These are legacy results awaiting source-workbook validation."} ${prior ? `The previous year was ${prior.fails} of ${prior.n} (${pct(prior.rate)}), a change of ${changeLabel(total.rate - prior.rate)}.` : 'No earlier year is available for comparison.'}</p><p><strong>Largest historical failure counts:</strong> ${leaders.map(r => `${escape(r.module)} (${r.fails})`).join(', ')}. Together these account for ${leadFailures} of ${total.fails} failed results (${pct(total.fails ? leadFailures / total.fails * 100 : 0)}). These modules will not run again under the new validation. We use their outcomes as historical evidence to inform programme-wide support; we cannot yet establish how many failures prevented progression.</p><p class="muted">Year-to-year differences are descriptive only. Earlier years retain the legacy extraction and need checks for summary-row contamination and assessment stage.</p>`;
    el('progressionBars').innerHTML = records.map(r => `<div class="progression-bar"><div><strong>${escape(r.module)}</strong><span>${r.fails} / ${r.n} · ${pct(r.rate)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${total.fails ? r.fails/total.fails*100 : 0}%;background:var(--red)"></div></div><small>${pct(total.fails ? r.fails/total.fails*100 : 0)} of this year’s failed results${r.n < 20 ? ' · small cohort' : ''}</small></div>`).join('');
    el('progressionYears').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Year</th><th>Results</th><th>Failed</th><th>Rate</th></tr></thead><tbody>${years.map(y => {const t=counts(data.filter(r => r.year===y));return `<tr${y===year?' class="progression-selected"':''}><td>${y}</td><td>${t.n}</td><td>${t.fails}</td><td>${pct(t.rate)}</td></tr>`;}).join('')}</tbody></table></div>`;
    el('progressionTable').innerHTML = records.map(r => `<tr><td><strong>${escape(r.module)}</strong><br><small>${escape(r.code)}${r.n<20?' · small cohort':''}</small></td><td>${r.n}</td><td>${r.fails}</td><td>${pct(r.rate)}</td><td>${changeLabel(r.change)}</td><td>${pct(total.fails?r.fails/total.fails*100:0)}</td><td>${r.near}</td><td>${r.history.fails} / ${r.history.n} (${pct(r.history.rate)})</td></tr>`).join('');
    const proposals = [
      ['Readiness for Level 5', 'We propose an early, low-stakes check of the knowledge and study skills expected by the new curriculum, followed by accessible refresher support where gaps are identified.'],
      ['Assessment planning and feedback', 'We recommend reviewing the programme assessment calendar for clustered deadlines, making expectations clear and providing formative feedback before major submissions. Staged checkpoints may be useful where the new assessment design supports them.'],
      ['Early engagement and support', 'We propose monitoring attendance, formative participation and missed submissions from the start, with timely personal-tutor contact and appropriate academic or pastoral support.'],
      ['Clear reassessment support', 'We recommend clear guidance on reassessment requirements, feedback and support opportunities, so students understand what they need to do and by when.'],
      ['Monitor the first new-validation cohort', 'We propose tracking submission, first-attempt outcomes, reassessment recovery and final progression at agreed review points. We should establish a new baseline and interpret comparisons with the old curriculum cautiously because module and assessment structures have changed.']
    ];
    el('progressionActions').innerHTML = proposals.map(([title,body]) => `<article class="report-card"><h3>${title}</h3><p>${body}</p></article>`).join('');
  }
  el('progressionYear').addEventListener('input',render);
  el('progressionSort').addEventListener('input',render);
  el('progressionExport').addEventListener('click',() => {
    const year=el('progressionYear').value;
    const total=counts(data.filter(r=>r.year===year));
    const rowsOut=[['Year','Module code','Module','Included results','Failed results (<40; zeros excluded at extraction)','Failure rate (%)','Prior available year','Change (percentage points)','Share of failed results (%)','Near pass (30 to <40)','Four-year failed results','Four-year included results','Scope'],...ranked(year,el('progressionSort').value||'fails').map(r=>[year,r.code,r.module,r.n,r.fails,r.rate.toFixed(2),r.previousYear,r.change===null?'':r.change.toFixed(2),total.fails?(r.fails/total.fails*100).toFixed(2):0,r.near,r.history.fails,r.history.n,`Full-time Level 5 module outcomes; ${year === '2025/2026' ? 'post-resit; summary rows excluded; imported 2026-11-06' : 'legacy extraction; assessment stage and summary rows require validation'}; final progression unknown; year-to-year comparisons not yet like-for-like`])];
    const csv=rowsOut.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`level-5-review-${year.replace('/','-')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  el('progressionPrint').addEventListener('click',()=>window.print());
  render();
  if(location.hash==='#progression') document.querySelector('[data-view="progression"]').click();
})();
