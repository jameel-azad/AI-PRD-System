export const SECTION_NAMES = [
  'Project Overview','Business Objectives & Success Metrics','Stakeholders & User Personas',
  'Scope (In / Out)','Functional Requirements','Non-Functional Requirements',
  'User Stories / Use Cases','Technical Constraints & Integrations','Data Requirements',
  'Timeline & Milestones','Assumptions & Dependencies','Open Questions & Follow-ups',
  'Glossary','Source Index'
]

export const STAGES = ['Intake','Processing','Drafted','Gap review','Feasibility','Client review','Approved']
// Badge CSS class per stage index — aligns with the backend ProjectStage enum order
export const STAGE_BADGE = ['gray','blue','gray','amber','blue','blue','green']

export const FLOW = [
  ['📥','Raw input ingestion','Files uploaded & stored (AES-256)'],
  ['🗣','Transcription','Whisper on GCP Cloud Run'],
  ['🧩','Chunking & embedding','pgvector / Vertex AI Vector Search'],
  ['🏷','Entity & intent extraction','Source-tagged per item'],
  ['🔀','Deduplication & merge','Across all sources'],
  ['🕳','Gap analysis','Flags missing sections → questions'],
  ['📄','PRD generation','Source-cited · multi-language'],
  ['📊','Completeness scoring','Per-section confidence'],
]

export const COUNTRIES = ['United States','United Kingdom','Germany (EU)','France (EU)','UAE','India','Singapore','Brazil','Other…']
export const INDUSTRIES = ['Healthcare','Fintech / Payments','Retail / E-commerce','Logistics','Government / Public sector','Defence','Education','Other…']
export const LANGS = ['English','French','German','Arabic','Spanish','Hindi']

export const USERS = [
  {id:'priya',  name:'Priya K.',   email:'priya.k@xccelera.com',  role:'bapm',  roleLabel:'BA / PM',          color:'c-teal',  status:'Active', last:'now'},
  {id:'arjun',  name:'Arjun M.',   email:'arjun.m@xccelera.com',  role:'bapm',  roleLabel:'BA / PM',          color:'c-blue',  status:'Active', last:'12 min ago'},
  {id:'sofia',  name:'Sofia R.',   email:'sofia.r@xccelera.com',  role:'admin', roleLabel:'Admin',            color:'c-violet',status:'Active', last:'1 h ago'},
  {id:'dan',    name:'Daniel O.',  email:'daniel.o@xccelera.com', role:'admin', roleLabel:'Admin',            color:'c-slate', status:'Active', last:'Yesterday'},
  {id:'meera',  name:'Meera T.',   email:'meera.t@xccelera.com',  role:'bapm',  roleLabel:'BA / PM',          color:'c-amber', status:'Invited',last:'—'},
  {id:'lena',   name:'Lena Weber', email:'l.weber@medaxis.de',    role:'client',roleLabel:'Client Reviewer',  color:'c-green', status:'Active', last:'2 h ago'},
  {id:'rana',   name:'Rana Haddad',email:'r.haddad@nimbusrg.ae',  role:'client',roleLabel:'Client Reviewer',  color:'c-violet',status:'Active', last:'Jun 9'},
]

export const BUILTIN_ROLES = [
  {id:'admin',  label:'Admin',            desc:'Manage members & roles · override feasibility hard blockers · all projects', badge:'violet', builtin:true, external:false},
  {id:'bapm',   label:'BA / PM',          desc:'Create projects · upload inputs · run AI analysis · edit & submit PRDs',     badge:'gray',   builtin:true, external:false},
  {id:'client', label:'Client Reviewer',  desc:'View their PRD · comment · answer questions · approve',                       badge:'blue',   builtin:true, external:true},
]

export const CLIENTS_DATA = [
  {name:'MedAxis Health', country:'Germany (EU)', industry:'Healthcare', deploy:'Private GCP (dedicated project: gcp-medaxis-prod)', contact:'Lena Weber · l.weber@medaxis.de', projects:1, access:'Client Reviewer'},
  {name:'Nimbus Retail Group', country:'UAE', industry:'Fintech / Retail', deploy:'SaaS (multi-tenant)', contact:'Rana Haddad · r.haddad@nimbusrg.ae', projects:1, access:'Client Reviewer'},
  {name:'Volkov Logistics', country:'—', industry:'Logistics', deploy:'SaaS — suspended (sanctions hold)', contact:'D. Volkov · d.volkov@vlk-logistics.com', projects:1, access:'Suspended'},
  {name:'Xccelera (internal)', country:'India', industry:'HR Tech', deploy:'Internal instance', contact:'HR Lead · hr-lead@xccelera.com', projects:1, access:'BA/PM'},
]

export const INITIAL_PROJECTS = [
  {
    id:'medaxis', name:'Patient Intake & Telehealth Portal', client:'MedAxis Health', country:'Germany (EU)', industry:'Healthcare',
    feas:'amber', completeness:71, status:'review', statusLabel:'In client review', langs:'EN + DE', deadline:'Jun 16, 2026',
    updated:'Today, 09:42', deploy:'Private GCP', approver:'l.weber@medaxis.de', stage:5,
    team:['priya','arjun','sofia'],
    sources:['🎥 2 calls','📄 4 docs','✉️ 1 thread'], tag:'GDPR · MDR flags injected',
    sections:[92,88,85,80,87,42,74,69,55,65,78,30,90,100],
    inputs:[
      {name:'kickoff_call_jun2.mp4', kind:'video', size:'612 MB', stat:'done', prog:100, meta:'38 min · transcribed · PII-redacted'},
      {name:'followup_call_jun9.mp4', kind:'video', size:'284 MB', stat:'done', prog:100, meta:'22 min · transcribed'},
      {name:'scope_doc_v2.pdf', kind:'doc', size:'2.1 MB', stat:'done', prog:100, meta:'14 pages · parsed'},
      {name:'data_residency_brief.docx', kind:'doc', size:'480 KB', stat:'done', prog:100, meta:'6 pages · parsed'},
      {name:'email_thread_jun5.pdf', kind:'email', size:'320 KB', stat:'done', prog:100, meta:'thread · 9 messages'},
      {name:'intake_form_spec.pdf', kind:'doc', size:'1.4 MB', stat:'proc', prog:64, meta:'extracting entities…'},
    ],
    flowState:[1,1,1,1,1,1,1,2],
    reqs:[
      {id:'FR-001',text:'The system shall allow patients to book, reschedule and cancel telehealth appointments.',cites:['kickoff_call_jun2.mp4 → 08:14','scope_doc_v2.pdf → Page 3'],conf:96,comments:0},
      {id:'FR-002',text:'The system shall verify patient insurance details against the provider registry during intake.',cites:['kickoff_call_jun2.mp4 → 21:40'],conf:88,comments:1},
      {id:'FR-003',text:'Clinicians shall receive a pre-consultation summary generated from the intake form.',cites:['email_thread_jun5.pdf → Page 2','followup_call_jun9.mp4 → 03:55'],conf:91,comments:0},
    ],
    injected:[
      {id:'NFR-C1',text:'Personal health data must be stored within the EU and erased on verified request.',reg:'GDPR Article 17',state:'pending'},
      {id:'NFR-C2',text:'The telehealth module must comply with EU MDR software classification (Rule 11) assessment.',reg:'EU MDR 2017/745',state:'pending'},
      {id:'NFR-C3',text:'Audit logs of all access to patient records must be retained for a minimum of 6 years.',reg:'§630f BGB / GDPR Art. 30',state:'accepted'},
    ],
    comments:[
      {sec:5, anchor:'§6 Non-Functional', thread:[
        {user:'lena', text:'What concurrent user load are we designing §6 around? Our peak intake is ~400 simultaneous sessions across clinics.', time:'Today 09:33'},
        {user:'priya', text:'Thanks @Lena — adding 400 concurrent as the baseline NFR and a 2× burst target. Will cite this thread.', time:'Today 09:40'},
      ], resolved:false},
      {sec:8, anchor:'§9 Data Requirements', thread:[
        {user:'lena', text:'Consultation recordings should be opt-in and retained 90 days max for compliance.', time:'Today 09:36'},
      ], resolved:false},
    ],
    feasReport:{
      score:'amber',
      summary:'Feasible with additional compliance work. Germany (EU) + Healthcare triggers GDPR, EU MDR and strict data-residency requirements. No sanctions exposure.',
      sanctions:[['clear','OFAC SDN & sectoral — no match'],['clear','UN Security Council Consolidated — no match'],['clear','EU CFSP Consolidated — no match'],['clear','UK OFSI — no match']],
      geo:[['clear','Politically stable; EU member state'],['warn','Data sovereignty: health data residency required in EU'],['clear','No trade restrictions on planned tech stack']],
      reg:[['warn','GDPR — full applicability incl. Art. 9 special-category health data'],['warn','EU MDR 2017/745 — telehealth software may classify as medical device'],['info','ISO 27001 + SOC 2 expected by enterprise procurement']],
      web:[['info','Jun 2026 — EDPB draft guidance on AI processing of health data (consultation open)'],['info','May 2026 — German DiGA fast-track updated for telehealth apps']],
    },
    feasResolved:{},
    clars:[
      {q:'No performance benchmarks mentioned. What is the expected concurrent user load?',gap:'Gap: §6 Non-Functional · confidence 42%',state:'open',assignee:'priya',prio:'high'},
      {q:'Should patient video consultations be recorded, and if so, what is the retention period?',gap:'Gap: §9 Data Requirements · confidence 38%',state:'open',assignee:'arjun',prio:'med'},
      {q:'Which insurance registries must intake verification integrate with at launch?',gap:'Gap: §8 Integrations · confidence 51%',state:'open',assignee:'',prio:'med'},
    ],
    activity:[
      {ico:'💬',c:'green-soft',cl:'var(--green)',txt:'<b>Lena Weber</b> commented on §6 Non-Functional',time:'Today 09:33'},
      {ico:'📄',c:'accent-soft',cl:'var(--accent)',txt:'<b>Priya K.</b> submitted PRD v0.9 for client approval',time:'Jun 11 11:05'},
      {ico:'⚖',c:'amber-soft',cl:'var(--amber)',txt:'Feasibility agent ran — MED · 3 compliance reqs injected',time:'Jun 11 10:40'},
      {ico:'🕳',c:'blue-soft',cl:'var(--blue)',txt:'Gap analysis generated 3 follow-up questions',time:'Jun 10 15:12'},
      {ico:'📥',c:'violet-soft',cl:'var(--violet)',txt:'<b>Arjun M.</b> uploaded followup_call_jun9.mp4',time:'Jun 9 17:50'},
    ],
  },
  {
    id:'nimbus', name:'Retail Loyalty & Wallet App', client:'Nimbus Retail Group', country:'UAE', industry:'Fintech / Retail',
    feas:'green', completeness:96, status:'approved', statusLabel:'Approved · v1.0 locked', langs:'EN + AR', deadline:'—',
    updated:'Jun 9, 14:05', deploy:'SaaS', approver:'r.haddad@nimbusrg.ae', stage:6,
    team:['arjun','sofia'],
    sources:['🎥 3 calls','🎙 1 audio','💬 Slack export'], tag:'PCI-DSS reqs · accepted',
    sections:[100,97,95,98,96,94,93,95,92,97,96,100,98,100],
    inputs:[
      {name:'discovery_call_may20.mp4', kind:'video', size:'540 MB', stat:'done', prog:100, meta:'45 min · transcribed'},
      {name:'slack_export_may.zip', kind:'chat', size:'3.2 MB', stat:'done', prog:100, meta:'#payments · 212 messages'},
    ],
    flowState:[1,1,1,1,1,1,1,1],
    reqs:[
      {id:'FR-001',text:'Customers shall earn points on purchases and redeem them in-store via QR code.',cites:['discovery_call_may20.mp4 → 11:02'],conf:98,comments:0},
      {id:'FR-002',text:'The wallet shall support stored-value top-up via card and Apple Pay / Google Pay.',cites:['slack_export_may.zip → #payments, May 26','discovery_call_may20.mp4 → 33:18'],conf:95,comments:0},
    ],
    injected:[
      {id:'NFR-C1',text:'All cardholder data flows must be PCI-DSS v4.0 compliant; no PAN storage in app database.',reg:'PCI-DSS v4.0',state:'accepted'},
      {id:'NFR-C2',text:'Stored-value wallet requires UAE Central Bank SVF licence or licensed partner.',reg:'CBUAE SVF Regulation',state:'accepted'},
    ],
    comments:[],
    feasReport:{
      score:'green',
      summary:'Project is feasible with standard compliance. PCI-DSS applies to payment flows; UAE SVF licensing addressed via licensed partner.',
      sanctions:[['clear','OFAC — no match'],['clear','UN — no match'],['clear','EU CFSP — no match'],['clear','UK OFSI — no match']],
      geo:[['clear','Stable jurisdiction; free-zone entity'],['clear','No data localization blocker for retail data']],
      reg:[['warn','PCI-DSS v4.0 for payment card flows'],['info','UAE PDPL applies to customer personal data']],
      web:[['info','Apr 2026 — CBUAE updated SVF outsourcing circular']],
    },
    feasResolved:{},
    clars:[],
    approval:{by:'Rana Haddad', email:'r.haddad@nimbusrg.ae', date:'Jun 9, 2026 · 14:05 GST', version:'v1.0'},
    activity:[
      {ico:'✅',c:'green-soft',cl:'var(--green)',txt:'<b>Rana Haddad</b> approved PRD v1.0 — locked',time:'Jun 9 14:05'},
      {ico:'📄',c:'accent-soft',cl:'var(--accent)',txt:'<b>Arjun M.</b> submitted for client approval',time:'Jun 8 10:20'},
    ],
  },
  {
    id:'volkov', name:'Fleet Telemetry Analytics', client:'Volkov Logistics', country:'—', industry:'Logistics',
    feas:'red', completeness:54, status:'blocked', statusLabel:'Blocked — admin override required', langs:'EN', deadline:'—',
    updated:'Jun 10, 17:31', deploy:'SaaS', approver:'d.volkov@vlk-logistics.com', stage:4,
    team:['priya','dan'],
    sources:['🎥 1 call','📄 2 docs'], tag:'Sanctions hit · OFAC SDN',
    sections:[78,60,55,70,62,38,40,52,44,30,58,20,65,100],
    inputs:[
      {name:'intro_call_jun4.mp4', kind:'video', size:'410 MB', stat:'done', prog:100, meta:'31 min · transcribed'},
      {name:'telematics_overview.pdf', kind:'doc', size:'3.0 MB', stat:'done', prog:100, meta:'22 pages · parsed'},
    ],
    flowState:[1,1,1,1,1,1,0,0],
    reqs:[
      {id:'FR-001',text:'The platform shall ingest GPS and CAN-bus telemetry from fleet vehicles every 30 seconds.',cites:['intro_call_jun4.mp4 → 06:47'],conf:90,comments:0},
    ],
    injected:[],
    comments:[],
    feasReport:{
      score:'red',
      summary:'Hard blocker detected — parent entity appears on the OFAC SDN list. PRD submission for client approval is locked until resolved or overridden by an Admin.',
      sanctions:[['block','OFAC SDN — match: parent entity \'Volkov Holdings\' (94% confidence)'],['clear','UN Security Council — no direct match'],['warn','EU CFSP — related entity under sectoral measures'],['clear','UK OFSI — no match']],
      geo:[['block','Export of telematics analytics software may breach sanctions'],['warn','Payment channels restricted for sanctioned counterparties']],
      reg:[['info','If blocker resolved: GDPR applies to EU driver data']],
      web:[['info','Jun 2026 — OFAC enforcement action against logistics software exporter (penalty $2.1M)']],
    },
    feasResolved:{},
    clars:[],
    activity:[
      {ico:'⛔',c:'red-soft',cl:'var(--red)',txt:'Feasibility agent flagged OFAC SDN hard blocker (0.94)',time:'Jun 10 17:31'},
      {ico:'📥',c:'violet-soft',cl:'var(--violet)',txt:'<b>Priya K.</b> uploaded intro_call_jun4.mp4',time:'Jun 4 12:10'},
    ],
  },
  {
    id:'hr', name:'Internal HR Onboarding Suite', client:'Xccelera (internal)', country:'India', industry:'HR Tech',
    feas:'green', completeness:63, status:'draft', statusLabel:'Draft · gap analysis run Jun 11', langs:'EN', deadline:'—',
    updated:'Jun 11, 18:20', deploy:'Internal', approver:'hr-lead@xccelera.com', stage:3,
    team:['meera','priya'],
    sources:['🎙 2 audio','📝 Notes','📄 1 doc'], tag:'4 follow-ups pending',
    sections:[85,70,72,66,68,45,55,50,48,40,60,25,70,100],
    inputs:[
      {name:'audio_jun8.m4a', kind:'audio', size:'88 MB', stat:'done', prog:100, meta:'41 min · transcribed'},
      {name:'audio_jun9.m4a', kind:'audio', size:'61 MB', stat:'done', prog:100, meta:'28 min · transcribed'},
      {name:'hr_policy_notes.txt', kind:'doc', size:'24 KB', stat:'done', prog:100, meta:'pasted notes'},
    ],
    flowState:[1,1,1,1,1,1,2,0],
    reqs:[
      {id:'FR-001',text:'New hires shall complete document submission and e-verification before day one.',cites:['audio_jun8.m4a → 05:12'],conf:92,comments:0},
    ],
    injected:[
      {id:'NFR-C1',text:'Employee personal data processing must comply with India DPDP Act consent requirements.',reg:'DPDP Act 2023 §6',state:'pending'},
    ],
    comments:[],
    feasReport:{
      score:'green',
      summary:'Feasible with standard compliance. India DPDP Act applies to employee personal data; no sanctions or geopolitical exposure.',
      sanctions:[['clear','All four lists — no match']],
      geo:[['clear','Internal deployment; data resides in Xccelera GCP project']],
      reg:[['warn','India DPDP Act 2023 — consent & purpose limitation'],['info','ISO 27001 alignment per internal policy']],
      web:[['info','May 2026 — DPDP Rules enforcement timeline confirmed']],
    },
    feasResolved:{},
    clars:[
      {q:'Timeline mentions "before Q4" — is the target launch date Oct 1 or end of Q4?',gap:'Conflict: audio_jun8.m4a → 22:10 vs notes_jun9',state:'open',assignee:'meera',prio:'high'},
      {q:'Should background verification be in scope for MVP or phase 2?',gap:'Gap: §4 Scope · confidence 49%',state:'open',assignee:'',prio:'low'},
      {q:'Which HRMS does the suite integrate with — Zoho People or Keka?',gap:'Gap: §8 Integrations · confidence 44%',state:'open',assignee:'priya',prio:'med'},
      {q:'Is manager sign-off required to complete onboarding, or HR only?',gap:'Gap: §7 User Stories · confidence 52%',state:'open',assignee:'',prio:'med'},
    ],
    activity:[
      {ico:'🕳',c:'blue-soft',cl:'var(--blue)',txt:'Gap analysis generated 4 follow-up questions',time:'Jun 11 18:20'},
      {ico:'📥',c:'violet-soft',cl:'var(--violet)',txt:'<b>Meera T.</b> uploaded audio_jun9.m4a',time:'Jun 9 14:00'},
    ],
  },
]
