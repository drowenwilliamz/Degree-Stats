const fs=require('fs');
let p='web/progression.js',s=fs.readFileSync(p,'utf8');
s=s.replace('<strong>We recommend prioritising:</strong>','<strong>Largest historical failure counts:</strong>').replace('We propose starting with these modules because they account for the largest numbers of failed results. We cannot yet establish how many of these failures prevented progression.','These modules will not run again under the new validation. We use their outcomes as historical evidence to inform programme-wide support; we cannot yet establish how many failures prevented progression.');
const start=s.indexOf('    const prompts = {'),end=s.indexOf('\n  }\n  el(',start);
if(start<0||end<0)throw new Error('Recommendations block not found');
s=s.slice(0,start)+`    const proposals = [
      ['Readiness for Level 5', 'We propose an early, low-stakes check of the knowledge and study skills expected by the new curriculum, followed by accessible refresher support where gaps are identified.'],
      ['Assessment planning and feedback', 'We recommend reviewing the programme assessment calendar for clustered deadlines, making expectations clear and providing formative feedback before major submissions. Staged checkpoints may be useful where the new assessment design supports them.'],
      ['Early engagement and support', 'We propose monitoring attendance, formative participation and missed submissions from the start, with timely personal-tutor contact and appropriate academic or pastoral support.'],
      ['Clear reassessment support', 'We recommend clear guidance on reassessment requirements, feedback and support opportunities, so students understand what they need to do and by when.'],
      ['Monitor the first new-validation cohort', 'We propose tracking submission, first-attempt outcomes, reassessment recovery and final progression at agreed review points. We should establish a new baseline and interpret comparisons with the old curriculum cautiously because module and assessment structures have changed.']
    ];
    el('progressionActions').innerHTML = proposals.map(([title,body]) => \`<article class="report-card"><h3>\${title}</h3><p>\${body}</p></article>\`).join('');`+s.slice(end);
fs.writeFileSync(p,s);
p='index.html';s=fs.readFileSync(p,'utf8');
s=s.replace('Our findings identify the modules with the greatest numbers and proportions of failed results.', 'The previous modules will not run again as Level 5 moves to the new validation. We retain the module analysis as historical evidence, while our proposals focus on support and monitoring across the new curriculum.');
s=s.replace('Our proposed priorities and responses','Our proposals for the new validation');
s=s.replace('We recommend using the meeting to agree the priority modules and the evidence needed to establish their contribution to non-progression.', 'We recommend using the meeting to agree programme-wide actions for the new validation and the evidence needed to understand past non-progression. These proposals are preventive measures for discussion; the marks alone do not establish the causes of failure.');
s=s.replace('For the priority modules, we recommend reviewing assessment components, submission and attendance patterns, changes to teaching or assessment, and student feedback. We can then agree targeted support, an owner and a review date for each action.', 'We propose reviewing the new curriculum and assessment plan alongside historical submission, engagement and student feedback evidence. We can then agree support priorities, an owner and review dates. We have not assumed one-to-one equivalence between old and new modules.');
fs.writeFileSync(p,s);
