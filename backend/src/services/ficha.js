function csvEscape(valor) {
  if (valor === null || valor === undefined) return '';
  const s = String(valor);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function gerarCsv(secoes) {
  const linhas = [];
  for (const { titulo, colunas, registros } of secoes) {
    linhas.push(`[${titulo}]`);
    if (colunas) {
      linhas.push(colunas.map(csvEscape).join(';'));
      for (const reg of registros || []) {
        linhas.push(colunas.map((c) => csvEscape(reg[c])).join(';'));
      }
    } else {
      for (const [chave, valor] of Object.entries(registros || {})) {
        linhas.push(`${csvEscape(chave)};${csvEscape(valor)}`);
      }
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

function pdfEscapar(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

export function gerarPdf(titulo, secoes) {
  const linhas = [titulo, ''];
  for (const { titulo: sub, colunas, registros } of secoes) {
    linhas.push(sub);
    if (colunas) {
      for (const reg of registros || []) {
        linhas.push('  ' + colunas.map((c) => `${c}: ${reg[c] ?? '-'}`).join(' | '));
      }
    } else {
      for (const [chave, valor] of Object.entries(registros || {})) {
        linhas.push(`  ${chave}: ${valor ?? '-'}`);
      }
    }
    linhas.push('');
  }

  const conteudo = linhas
    .slice(0, 60)
    .map((l, i) => `BT /F1 10 Tf 40 ${780 - i * 14} Td (${pdfEscapar(l).slice(0, 110)}) Tj ET`)
    .join('\n');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(conteudo)} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objetos.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
