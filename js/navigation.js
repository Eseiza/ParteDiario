// Navegación de interfaz: sin Firebase ni lógica de negocio.
(() => {
  const showPanel = (scope, selector, targetId) => {
    scope.querySelectorAll(selector).forEach(panel => {
      const active = panel.id === targetId;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
      if (panel.classList.contains('vis-panel')) panel.style.display = active ? 'block' : 'none';
    });
  };

  document.querySelectorAll('[data-subview-group]').forEach(select => {
    select.addEventListener('change', () => {
      const group = document.getElementById(select.dataset.subviewGroup);
      if (!group) return;
      showPanel(group, '.mtto-subpanel', select.value);

      const title = group.querySelector('.context-title');
      const option = select.options[select.selectedIndex];
      if (title && option) title.textContent = option.textContent.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

      document.dispatchEvent(new CustomEvent('parted:subviewchange', {
        detail: { groupId: group.id, targetId: select.value }
      }));
    });
  });
})();
