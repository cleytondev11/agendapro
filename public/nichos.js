/* Nichos atendidos: cor do tema, serviços e produtos iniciais. Usado pelo app, pela Central e pelo servidor. */
(function (root) {
  const NICHOS = {
    barbearia: {
      label: 'Barbearia', icon: '💈', cor: '#c8a24a',
      servicos: [['Corte masculino', 40, 30], ['Barba', 30, 20], ['Corte + barba', 60, 50], ['Pezinho', 15, 10], ['Sobrancelha', 15, 10], ['Pigmentação', 35, 30]],
      produtos: [['Pomada modeladora', 18, 45, 10], ['Óleo para barba', 15, 40, 8], ['Shampoo anticaspa', 12, 35, 6], ['Lâmina descartável (cx)', 25, 0, 5]]
    },
    lash: {
      label: 'Lash / Cílios', icon: '👁️', cor: '#d9668f',
      servicos: [['Fio a fio', 130, 120], ['Volume brasileiro', 150, 120], ['Volume russo', 180, 150], ['Manutenção', 80, 60], ['Remoção', 40, 30], ['Lash lifting', 100, 60]],
      produtos: [['Cola para extensão', 60, 0, 3], ['Fios 0.07 (caixa)', 35, 0, 5], ['Removedor em gel', 25, 0, 2], ['Escovinhas (pct)', 8, 15, 10]]
    },
    manicure: {
      label: 'Manicure & Pedicure', icon: '💅', cor: '#e0607e',
      servicos: [['Manicure', 30, 40], ['Pedicure', 35, 45], ['Pé e mão', 60, 80], ['Esmaltação em gel', 70, 60], ['Alongamento em gel', 150, 120], ['Spa dos pés', 50, 40]],
      produtos: [['Esmalte (un)', 6, 15, 20], ['Acetona 500ml', 9, 0, 4], ['Lixa (pct)', 10, 0, 5], ['Gel construtor', 45, 0, 2]]
    },
    cabeleireira: {
      label: 'Salão / Cabeleireira', icon: '💇‍♀️', cor: '#9a72e0',
      servicos: [['Corte feminino', 70, 60], ['Escova', 50, 45], ['Hidratação', 80, 60], ['Coloração', 150, 120], ['Luzes / Mechas', 300, 240], ['Progressiva', 250, 180]],
      produtos: [['Shampoo profissional', 40, 75, 4], ['Máscara de hidratação', 55, 95, 4], ['Tinta (tubo)', 18, 0, 10], ['Água oxigenada', 14, 0, 4]]
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NICHOS;
  else root.NICHOS = NICHOS;
})(this);
