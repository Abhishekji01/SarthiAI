/** Builds a minimal single-page text PDF (Helvetica) for tests. */
export function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = `BT /F1 10 Tf 12 TL 50 800 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export const SAMPLE_RESUME = [
  'Isha Sharma', 'isha@example.test | +91 98765 43210',
  'Education', 'B.Tech Computer Science, KIET Group of Institutions, 2023 - 2027',
  'Technical Skills', 'Languages: Python, Java, C++, SQL', 'Frameworks: React, Node.js, Django, TensorFlow', 'Tools: Git, Linux, Docker',
  'Projects',
  'Campus Lost & Found | React, Node.js, MongoDB',
  '- Built a web app used by 400 students to report and find lost items',
  'Crop Disease Detector - Python, TensorFlow',
  '- Trained a CNN on 5,000 leaf images; 91% validation accuracy',
  'Experience',
  'Software Engineering Intern at Acme Analytics (May 2026 - Jul 2026)',
  '- Wrote data pipelines in Python and SQL',
  'Web Developer, College Tech Club | 2024 - Present',
  '- Maintain the club website',
  'Achievements', 'Top 10 in college CTF 2026',
];
