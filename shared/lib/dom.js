// @ts-check

/**
 * querySelector shorthand. Typed as `any` so callers can use `.value` and similar without casts.
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any}
 */
export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any[]}
 */
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Create an HTML element.
 * Attributes: `class`, `text` (textContent), `on<event>` (listener); anything else is set as an attribute.
 * `null`, `undefined` and `false` values and children are skipped.
 * @param {string} tag
 * @param {Record<string, any> | null} [attributes]
 * @param {...any} children
 * @returns {any}
 */
export function el(tag, attributes = null, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (isPresent(value)) applyAttribute(element, key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (isPresent(child)) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

/** @param {unknown} value */
const isPresent = (value) => value !== null && value !== undefined && value !== false;

/** @param {HTMLElement} element @param {string} key @param {any} value */
function applyAttribute(element, key, value) {
  if (key === 'class') element.className = value;
  else if (key === 'text') element.textContent = value;
  else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
  else element.setAttribute(key, value === true ? '' : String(value));
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element. Styles go through `style` so CSS variables work.
 * @param {string} tag
 * @param {Record<string, string | number>} [attributes]
 * @param {Partial<CSSStyleDeclaration>} [style]
 * @returns {any}
 */
export function svgEl(tag, attributes = {}, style = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  Object.assign(element.style, style);
  return element;
}
