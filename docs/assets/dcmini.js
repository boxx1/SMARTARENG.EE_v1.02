/* dcmini — a tiny stand-alone runtime for the Smart Areng design files (*.dc.html).
   Supports what the files use: {{ path }} holes, <sc-if>, <sc-for>, <dc-import>, on* event holes,
   class Component extends DCLogic { state, setState, renderVals, componentDidMount }.
   The same code renders on the server (Node, for a pre-rendered page that any reader can see)
   and in the browser (to make the page interactive). */
(function (root) {
  'use strict';
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, p);
    if (this.__app) this.__app.schedule();
  };

  /* ---------- template parsing ---------- */
  var TAG = /<(\/?)(sc-if|sc-for|dc-import)\b([^>]*)>/g;
  function attrs(s) {
    var o = {}, re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(s))) o[m[1]] = m[2];
    return o;
  }
  function parse(src) {
    var rootN = { k: 'root', c: [] }, stack = [rootN], last = 0, m;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(src))) {
      if (m.index > last) stack[stack.length - 1].c.push({ k: 't', s: src.slice(last, m.index) });
      last = TAG.lastIndex;
      if (m[1]) { if (m[2] !== 'dc-import') stack.pop(); continue; }
      var a = attrs(m[3]);
      if (m[2] === 'dc-import') { stack[stack.length - 1].c.push({ k: 'imp', a: a }); continue; }
      var n = { k: m[2] === 'sc-if' ? 'if' : 'for', a: a, c: [] };
      stack[stack.length - 1].c.push(n); stack.push(n);
    }
    if (last < src.length) stack[stack.length - 1].c.push({ k: 't', s: src.slice(last) });
    return rootN;
  }
  function holeName(v) { var m = /^\{\{\s*([\w.$]+)\s*\}\}$/.exec(v || ''); return m ? m[1] : null; }
  function look(scope, path) {
    var parts = path.split('.'), v;
    for (var i = scope.length - 1; i >= 0; i--) if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { v = scope[i][parts[0]]; break; }
    for (var j = 1; j < parts.length && v != null; j++) v = v[parts[j]];
    return v;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escA(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* ---------- rendering ---------- */
  function App(defs) { this.defs = defs; this.inst = {}; this.handlers = []; this.timer = null; }
  App.prototype.schedule = function () {
    var self = this;
    if (this.timer || !this.el) return;
    this.timer = setTimeout(function () { self.timer = null; self.paint(); }, 0);
  };
  App.prototype.instance = function (key, name, props) {
    var d = this.defs[name];
    if (!this.inst[key]) {
      var C = d.Component, o = Object.assign({}, d.defaults, props);
      var c = new C(o); c.props = o; if (!c.state) c.state = {}; c.__app = this; c.__name = name;
      this.inst[key] = c;
    }
    return this.inst[key];
  };
  App.prototype.renderComp = function (key, name, props) {
    var c = this.instance(key, name, props), d = this.defs[name];
    var vals = c.renderVals ? c.renderVals() : {};
    return this.renderNodes(d.tree.c, [vals], key);
  };
  App.prototype.renderNodes = function (nodes, scope, key) {
    var out = '', self = this;
    nodes.forEach(function (n, i) {
      if (n.k === 't') out += self.renderText(n.s, scope);
      else if (n.k === 'if') { if (look(scope, holeName(n.a.value))) out += self.renderNodes(n.c, scope, key); }
      else if (n.k === 'for') {
        var list = look(scope, holeName(n.a.list)) || [], as = n.a.as || 'item';
        list.forEach(function (item, idx) { var s = {}; s[as] = item; out += self.renderNodes(n.c, scope.concat([s]), key + '.' + i + '_' + idx); });
      } else if (n.k === 'imp') {
        var props = {};
        Object.keys(n.a).forEach(function (k) { if (k !== 'name' && k.indexOf('hint-') !== 0) { var h = holeName(n.a[k]); props[k] = h ? look(scope, h) : n.a[k]; } });
        out += self.renderComp(key + '/' + n.a.name + i, n.a.name, props);
      }
    });
    return out;
  };
  App.prototype.renderText = function (s, scope) {
    var self = this;
    /* attributes bound to holes */
    s = s.replace(/\s([a-zA-Z][-a-zA-Z0-9]*)="\{\{\s*([\w.$]+)\s*\}\}"/g, function (all, name, path) {
      var v = look(scope, path);
      if (/^on[A-Z]/.test(name)) {
        if (typeof v !== 'function') return '';
        var id = self.handlers.push(v) - 1;
        return ' data-ev-' + name.slice(2).toLowerCase() + '="' + id + '"';
      }
      if (name.indexOf('hint-') === 0) return '';
      if (v === false || v == null) return '';
      if (v === true) return ' ' + name;
      return ' ' + name + '="' + escA(v) + '"';
    });
    return s.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, function (all, path) { var v = look(scope, path); return v == null || v === false ? '' : esc(v); });
  };
  App.prototype.html = function () { this.handlers = []; return this.renderComp('root', this.rootName, this.rootProps || {}); };

  /* ---------- browser ---------- */
  var EVENTS = ['click', 'input', 'change', 'dragstart', 'dragend', 'dragover', 'dragleave', 'drop', 'keydown'];
  App.prototype.mount = function (el, rootName, rootProps) {
    var self = this;
    this.el = el; this.rootName = rootName; this.rootProps = rootProps;
    EVENTS.forEach(function (t) {
      el.addEventListener(t, function (e) {
        var n = e.target;
        while (n && n !== el.parentNode) {
          if (n.getAttribute && n.hasAttribute('data-ev-' + t)) {
            var fn = self.handlers[+n.getAttribute('data-ev-' + t)];
            if (fn) { try { Object.defineProperty(e, 'currentTarget', { value: n, configurable: true }); } catch (x) {} fn(e); }
            return;
          }
          n = n.parentNode;
        }
      }, t === 'dragover' || t === 'drop' ? false : undefined);
    });
    this.paint();
    Object.keys(this.inst).forEach(function (k) { var c = self.inst[k]; if (c.componentDidMount) c.componentDidMount(); });
  };
  App.prototype.paint = function () {
    var el = this.el, keep = Array.prototype.slice.call(el.querySelectorAll('[data-keep]'));
    var a = document.activeElement, focusKey = null, selS = null, selE = null;
    if (a && el.contains(a)) {
      focusKey = a.getAttribute('data-ev-input') || a.getAttribute('data-ev-click');
      try { selS = a.selectionStart; selE = a.selectionEnd; } catch (x) {}
    }
    var scrollY = window.scrollY;
    el.innerHTML = this.html();
    keep.forEach(function (old) {
      var fresh = el.querySelector('[data-keep="' + old.getAttribute('data-keep') + '"]');
      if (fresh) fresh.parentNode.replaceChild(old, fresh);
    });
    if (focusKey != null) {
      var f = el.querySelector('[data-ev-input="' + focusKey + '"]') || el.querySelector('[data-ev-click="' + focusKey + '"]');
      if (f) { f.focus({ preventScroll: true }); try { if (selS != null) f.setSelectionRange(selS, selE); } catch (x) {} }
    }
    if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY);
  };

  var api = { DCLogic: DCLogic, parse: parse, App: App };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.dcmini = api;
})(this);
