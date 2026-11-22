// Self-check for the subagent-models client module (not part of the bundle).
// Exercises factory, apply, slot registrations, component renders, AND the
// effect bodies with a minimal fake DOM, including a structural panel sync
// where an equal-count wrong root must be rejected by label verification.
const fs = require('node:fs')
const base = require('node:path').resolve(__dirname, '..')
const code = fs.readFileSync(base + '/client.js', 'utf8')

// --- minimal fake DOM ---
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase()
    this.nodeType = 1
    this.children = []
    this.parentNode = null
    this.textContent = ''
    this._role = null
    this._panel = false
    this._badge = false
    this.style = { cssText: '' }
  }
  get firstElementChild() { return this.children.find(child => child.nodeType === 1) || null }
  get firstChild() { return this.children[0] || null }
  get nextElementSibling() {
    if (this.parentNode === null) return null
    const siblings = this.parentNode.children.filter(child => child.nodeType === 1)
    const index = siblings.indexOf(this)
    return index >= 0 && index + 1 < siblings.length ? siblings[index + 1] : null
  }
  getAttribute(name) {
    if (name === 'role') return this._role
    return null
  }
  setAttribute(name, value) {
    if (name === 'role') this._role = value
    if (name === 'data-subagent-model-badge') this._badge = true
  }
  removeAttribute() {}
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  insertBefore(child, ref) {
    child.parentNode = this
    const i = this.children.indexOf(ref)
    this.children.splice(i < 0 ? this.children.length : i, 0, child)
    return child
  }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this)
      if (i >= 0) this.parentNode.children.splice(i, 1)
      this.parentNode = null
    }
  }
  matches(selector, parent) {
    if (selector === ':scope > [role="group"]') return this._role === 'group' && this.parentNode === parent
    if (selector === ':scope > div') return this.tagName === 'DIV' && this.parentNode === parent
    if (selector === ':scope > [data-subagent-model-badge]') return this._badge && this.parentNode === parent
    if (selector === '[role="treeitem"]') return this._role === 'treeitem'
    if (selector === '[role="tree"]') return this._role === 'tree'
    if (selector === '[role="group"]') return this._role === 'group'
    if (selector === '[data-subagent-panel]') return this._panel
    if (selector === '[data-subagent-model-badge]') return this._badge
    return false
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
  querySelectorAll(selector) {
    const out = []
    const visit = (node) => {
      for (const child of node.children) {
        if (child.nodeType === 1) {
          if (child.matches(selector, node)) out.push(child)
          visit(child)
        }
      }
    }
    visit(this)
    return out
  }
  closest(selector) {
    let node = this
    while (node !== null) {
      if (node.nodeType === 1 && node.matches(selector, node.parentNode)) return node
      node = node.parentNode
    }
    return null
  }
}
const textNode = (text) => ({ nodeType: 3, textContent: text })
const element = (tag) => new FakeNode(tag)

let openPanel = null
globalThis.document = {
  createElement: (tag) => element(tag),
  querySelector: (selector) => (openPanel !== null && selector === '[data-subagent-panel]' ? openPanel : null),
  querySelectorAll: (selector) => (openPanel !== null && selector === '[data-subagent-panel]' ? [openPanel] : []),
  head: { appendChild() {} },
  body: {},
}
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
}

// --- fake React that records and runs effects ---
const anchorRef = { current: null }
const effectBodies = []
const react = {
  createElement: (tag, props) => ({ tag, props }),
  useRef: () => anchorRef,
  useMemo: (fn) => fn(),
  useEffect: (fn) => { effectBodies.push(fn) },
}
const sandboxRequire = (id) => { if (id === 'react') return react; throw new Error('unexpected require: ' + id) }

let def = null
const sandboxWindow = { __ModuleLoader__: { load(d) { def = d } } }
new Function('window', 'require', code)(sandboxWindow, sandboxRequire)
if (!def || def.id !== '@hukj/dsh-subagent-model-tags') throw new Error('bad id')

const mod = def.factory(sandboxRequire)
if (JSON.stringify(mod.inject) !== JSON.stringify(['slots', 'sessions'])) {
  throw new Error('wrong inject: ' + JSON.stringify(mod.inject))
}

const registered = []
const ctx = {
  sessions: { refreshProjections: async () => {} },
  effect: (fn) => { fn() },
  slots: {
    inject: (owner, cb) => {
      if (owner !== 'conversation.session.header.actions.subagent.footer'
        && owner !== 'conversation.session.header.actions') throw new Error('bad owner: ' + owner)
      cb()
    },
    register: (options, component) => { registered.push([options, component]) },
  },
}
mod.apply(ctx)
if (registered.length !== 2) throw new Error('slot registrations missing: ' + registered.length)
const footerEntry = registered.find(([options]) => options.name === 'conversation.session.header.actions.subagent.footer')
const actionsEntry = registered.find(([options]) => options.name === 'conversation.session.header.actions')
if (!footerEntry || footerEntry[0].id !== 'subagent-models') throw new Error('bad footer slot entry')
if (!actionsEntry || actionsEntry[0].id !== 'subagent-models') throw new Error('bad actions slot entry')
if (typeof sandboxWindow.__subagentModelsDebug !== 'function') throw new Error('debug handle missing')

// --- store state: viewed session s0 (child of p0, grandchild of g0); decoy root p0 ---
const storeState = {
  projectionsBySession: {
    s0: {
      state: 'ready', error: null,
      values: { subagentCatalog: [{ id: 'c1', mode: 'continuable', name: 'a1', label: 'L1' }] },
    },
    p0: {
      state: 'ready', error: null,
      values: { subagentCatalog: [
        { id: 'x1', mode: 'continuable', name: 'decoy1', label: 'OTHER' },
        { id: 'x2', mode: 'continuable', name: 'decoy2', label: 'OTHER2' },
      ] },
    },
    g0: {
      state: 'ready', error: null,
      values: { subagentCatalog: [{ id: 's0', mode: 'continuable', name: 'a0', label: 'L0' }, { id: 'p0', mode: 'continuable', name: 'p', label: 'P0' }] },
    },
  },
  byId: {
    s0: { origin: 'subagent', parentId: 'p0' },
    p0: { origin: 'subagent', parentId: 'g0' },
    g0: { origin: 'root' },
  },
}
const useSessions = (selector) => selector(storeState)
const useSession = (selector) => selector({
  subagent: { address: { parentSessionId: 'p0', childSessionId: 's0', mode: 'continuable' } },
})

const footerComponent = footerEntry[1]
const actionsComponent = actionsEntry[1]
const elementTree = footerComponent({ sessionId: 's0', useSessions })
if (!elementTree || elementTree.tag !== 'span' || elementTree.props.hidden !== true) throw new Error('footer component did not render the anchor span')
const actionsTree = actionsComponent({ sessionId: 's0', useSessions, useSession })
if (actionsTree !== null) throw new Error('actions component must render nothing')

// --- fake open panel: a root-ancestor panel showing g0's two children ---
const makeRow = (labelText) => {
  const rowNode = element('div')
  const row = element('div')
  row._role = 'treeitem'
  const clickarea = element('div')
  const activity = element('span')
  const content = element('span')
  const label = element('span')
  label.appendChild(textNode(labelText))
  content.appendChild(label)
  clickarea.appendChild(activity)
  clickarea.appendChild(content)
  row.appendChild(clickarea)
  rowNode.appendChild(row)
  return { rowNode, row, label }
}
const first = makeRow('L0')
const second = makeRow('P0')
const panel = element('div')
panel._panel = true
const menuBody = element('div')
const tree = element('div')
tree._role = 'tree'
tree.appendChild(first.rowNode)
tree.appendChild(second.rowNode)
const anchor = element('span')
menuBody.appendChild(tree)
menuBody.appendChild(anchor)
panel.appendChild(menuBody)
openPanel = panel
anchorRef.current = anchor

for (const effect of effectBodies) {
  const cleanup = effect()
  if (typeof cleanup !== 'function') throw new Error('effect must return a cleanup function')
  cleanup()
}

// --- assertions on the structural sync with label verification ---
const debug = sandboxWindow.__subagentModelsDebug()
if (!debug || !debug.home) throw new Error('debug did not record the home sync')
if (debug.home.pairedRows.length !== 1 || debug.home.pairedRows[0].id !== 'c1') {
  throw new Error('home sync must pair only its own root entry: ' + JSON.stringify(debug.home.pairedRows))
}
if (!debug.lineage) throw new Error('debug did not record the header-actions sync')
if (JSON.stringify(debug.lineage.candidateRoots) !== JSON.stringify(['s0', 'p0', 'g0'])) {
  throw new Error('ancestor chain must reach the root, got: ' + JSON.stringify(debug.lineage.candidateRoots))
}
if (debug.lineage.panels !== 1) throw new Error('expected one observed panel')
if (JSON.stringify(debug.lineage.matchedRoots) !== JSON.stringify(['g0'])) {
  throw new Error('ancestor root g0 must win after closer candidates fail, got: ' + JSON.stringify(debug.lineage.matchedRoots))
}
const attempts = debug.lineage.panelReports[0].attempts
if (attempts.length !== 2 || attempts[0].reason !== 'count' || attempts[1].reason !== 'label') {
  throw new Error('expected a count rejection then a label rejection before g0 matched: ' + JSON.stringify(attempts))
}
if (debug.lineage.pairedRows.length !== 2
  || debug.lineage.pairedRows[0].id !== 's0'
  || debug.lineage.pairedRows[1].id !== 'p0') {
  throw new Error('expected s0 and p0 paired in order: ' + JSON.stringify(debug.lineage.pairedRows))
}
for (const [name, built] of [['L0', first], ['P0', second]]) {
  const badge = built.label.querySelector('[data-subagent-model-badge]')
  if (badge === null) throw new Error('badge missing on row ' + name)
  if (badge.textContent !== '—') throw new Error('badge on row ' + name + ' should show the no-model marker, got: ' + badge.textContent)
  if (built.label.children[0] === null || built.label.children[0].textContent !== name) {
    throw new Error('row ' + name + ' label text node must stay intact and first')
  }
}

const manifest = JSON.parse(fs.readFileSync(base + '/package.json', 'utf8'))
if (manifest.name !== def.id) throw new Error('manifest name must equal the client module id')
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) {
  throw new Error('manifest version is not semver: ' + manifest.version)
}
for (const locale of ['en', 'zh', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
  const json = JSON.parse(fs.readFileSync(`${base}/locale/${locale}.json`, 'utf8'))
  if (!json.meta.title || !json.meta.description) throw new Error('locale check failed: ' + locale)
}
console.log('client.js OK: registrations, renders, effects, ancestor-chain candidates, label verification, model names on both rows')
console.log('manifest 1.0.0 + 8 locales OK')
