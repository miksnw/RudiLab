/** Мини-хелперы для DOM: h() собирает элементы без шаблонизаторов и сборки. */
export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * h('div', { class: 'x', onclick: fn, style: '...' }, ...children)
 * props: class, text, on<event>, остальное — атрибуты (false/null пропускаются).
 * children: строки, Node, массивы (вложенные плоско), null/false игнорируются.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) el.append(child.nodeType ? child : document.createTextNode(child));
  }
  return el;
}
