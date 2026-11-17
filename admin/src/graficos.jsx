import React from 'react';

export function GraficoBarras({ dados, xChave, series, alturaRotulo = 26 }) {
  const n = dados.length || 1;
  const largura = 600;
  const alturaArea = 140;
  const altura = alturaArea + alturaRotulo;
  const larguraBarra = largura / n;
  const max = Math.max(1, ...dados.map((d) => series.reduce((s, sr) => s + (d[sr.chave] || 0), 0)));

  function rotuloX(item, i) {
    const valor = String(item[xChave]);
    if (xChave === 'hora') {
      if (i % 4 !== 0) return '';
      return valor.slice(11, 13) + 'h';
    }
    return valor.slice(8, 10) + '/' + valor.slice(5, 7);
  }

  return (
    <svg className="grafico" viewBox={`0 0 ${largura} ${altura}`} role="img">
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={largura}
          y1={alturaArea * f}
          y2={alturaArea * f}
          className="grafico-linha-guia"
        />
      ))}
      {dados.map((item, i) => {
        let acumulado = 0;
        const x = i * larguraBarra + larguraBarra * 0.15;
        const w = larguraBarra * 0.7;
        return (
          <g key={i}>
            {series.map((sr) => {
              const valor = item[sr.chave] || 0;
              if (!valor) return null;
              const h = (valor / max) * (alturaArea - 6);
              acumulado += h;
              const y = alturaArea - acumulado;
              return (
                <rect key={sr.chave} x={x} y={y} width={w} height={h} rx="2" className={`grafico-barra ${sr.classe}`}>
                  <title>
                    {xChave === 'hora' ? item[xChave].replace('T', ' ') : item[xChave]}
                    {' — '}
                    {series.map((s2) => `${s2.nome}: ${item[s2.chave] || 0}`).join(', ')}
                  </title>
                </rect>
              );
            })}
            <text x={i * larguraBarra + larguraBarra / 2} y={alturaArea + 16} textAnchor="middle" className="grafico-rotulo">
              {rotuloX(item, i)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Legenda({ series }) {
  return (
    <div className="grafico-legenda">
      {series.map((s) => (
        <span key={s.chave}>
          <i className={`grafico-amostra ${s.classe}`} /> {s.nome}
        </span>
      ))}
    </div>
  );
}
