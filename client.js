window.__ModuleLoader__.load({
  id: '@hukj/dsh-subagent-model-tags',
  factory(require) {
    const React = require('react');

    const BADGE_MARK = 'data-subagent-model-badge';

    let sessionsService = null;
    let lastDebug = null;

    /** Badge text for one recorded model selection; null when nothing is recorded. */
    function modelText(selection) {
      if (selection === null || selection === undefined) return null;
      if (typeof selection.model !== 'string' || selection.model === '') return null;
      const prefix = typeof selection.provider === 'string' && selection.provider !== ''
        ? selection.provider + '/'
        : '';
      const route = prefix + selection.model;
      return typeof selection.reasoningEffort === 'string' && selection.reasoningEffort !== ''
        ? route + ' · ' + selection.reasoningEffort
        : route;
    }

    /**
     * Map every catalog child's session id to its badge text.
     * A value of null means the child is known but has no recorded model yet.
     */
    function modelMapOf(projections) {
      const map = new Map();
      if (projections === null || typeof projections !== 'object') return map;
      for (const snapshot of Object.values(projections)) {
        const entries = snapshot && snapshot.values ? snapshot.values.subagentCatalog : undefined;
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const child = projections[entry.id];
          const selection = child && child.values ? child.values.modelSelection : undefined;
          const chosen = (selection && (selection.next || selection.lastUsed)) || null;
          map.set(entry.id, modelText(chosen));
        }
      }
      return map;
    }

    /**
     * Pair each rendered row with its catalog entry by walking the panel's tree
     * structure in order, recursing through rendered (expanded) groups. Every
     * nesting level pairs by position, so no displayed-text matching is needed.
     */
    function collectRows(container, entries, projections, out) {
      if (!Array.isArray(entries) || entries.length === 0) return;
      const nodes = Array.from(container.children).filter(element =>
        element.firstElementChild !== null
        && element.firstElementChild.getAttribute('role') === 'treeitem');
      let index = 0;
      for (const entry of entries) {
        const node = nodes[index++];
        if (node === undefined) break;
        const row = node.firstElementChild;
        out.push([row, entry]);
        const group = node.querySelector(':scope > [role="group"]');
        if (group !== null) {
          const child = projections[entry.id];
          collectRows(
            group,
            child && child.values ? child.values.subagentCatalog : undefined,
            projections,
            out,
          );
        }
      }
    }

    /**
     * Place or update one row's model badge on the row's name line: inside the
     * secondary name span when the row shows a description, else inside the
     * label span. Appends after the line's text; never inserts between the
     * host's own React children.
     */
    function applyBadge(row, text) {
      const area = row.querySelector(':scope > div');
      if (area === null) return;
      const content = area.children[1];
      if (!content || content.tagName !== 'SPAN') return;
      const label = content.firstElementChild;
      if (!label || label.tagName !== 'SPAN') return;
      const line = label.nextElementSibling !== null && label.nextElementSibling.tagName === 'SPAN'
        ? label.nextElementSibling
        : label;
      if (text === undefined) {
        const stale = content.querySelector(':scope > [' + BADGE_MARK + ']');
        if (stale !== null) stale.remove();
        return;
      }
      const shown = text === null ? '—' : text;
      let badge = line.querySelector(':scope > [' + BADGE_MARK + ']');
      if (badge === null) {
        badge = document.createElement('span');
        badge.setAttribute(BADGE_MARK, 'true');
        badge.setAttribute('aria-hidden', 'true');
        badge.style.cssText = 'display:inline-block;margin-left:6px;padding:0 6px;'
          + 'border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);'
          + 'color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;'
          + 'font-weight:400;white-space:nowrap;vertical-align:1px;';
        line.appendChild(badge);
      }
      if (text === null) badge.removeAttribute('title');
      else badge.setAttribute('title', text);
      if (badge.textContent !== shown) badge.textContent = shown;
    }

    /** The displayed primary label a catalog entry renders on its row. */
    function expectedLabel(entry, summaries) {
      const summary = summaries ? summaries[entry.id] : undefined;
      const name = entry.mode === 'continuable' || entry.mode === 'external'
        ? entry.name || entry.id
        : entry.id;
      return entry.label || (summary && summary.title) || name;
    }

    /** The row's displayed primary label text, or null when unavailable. */
    function rowLabel(row) {
      const area = row.querySelector(':scope > div');
      if (area === null) return null;
      const content = area.children[1];
      if (!content || content.tagName !== 'SPAN') return null;
      const label = content.firstElementChild;
      if (!label || label.tagName !== 'SPAN') return null;
      const textNode = label.firstChild;
      if (!textNode || textNode.nodeType !== 3) return null;
      return String(textNode.textContent || '').trim();
    }

    /**
     * Sync the panel we are mounted in by structural row/entry pairing against
     * its known root session's catalog. The root is known, so no verification
     * is needed here; the pairing is positional and complete.
     */
    function syncHomePanel(panel, rootEntries, projections, models) {
      const pairs = [];
      const tree = panel.querySelector('[role="tree"]');
      if (tree !== null) collectRows(tree, rootEntries, projections, pairs);
      for (const [row, entry] of pairs) {
        applyBadge(row, models.get(entry.id));
      }
      return pairs;
    }

    /**
     * Sync a panel whose seat we are not mounted in: try structural pairing
     * against each candidate root session's catalog; accept a candidate only
     * when it pairs every rendered row AND each paired row's displayed label
     * equals its entry's expected label. When no candidate verifies, the panel
     * is left alone rather than badged with guesses, and the failed attempts
     * are reported for diagnosis.
     */
    function syncForeignPanel(panel, candidateRoots, projections, summaries, models) {
      const rows = Array.from(panel.querySelectorAll('[role="treeitem"]'));
      if (rows.length === 0) return null;
      const rowLabels = rows.map(row => rowLabel(row));
      const tree = panel.querySelector('[role="tree"]');
      const attempts = [];
      if (tree === null) {
        return { rootId: null, pairs: [], attempts: [{ reason: 'no-tree', rows: rows.length }] };
      }
      for (const rootId of candidateRoots) {
        const snapshot = projections ? projections[rootId] : undefined;
        const entries = snapshot && snapshot.values ? snapshot.values.subagentCatalog : undefined;
        const pairs = [];
        collectRows(tree, entries, projections, pairs);
        if (pairs.length !== rows.length) {
          attempts.push({ rootId, reason: 'count', rows: rows.length, paired: pairs.length,
            rowLabels: rowLabels.slice(0, 12) });
          continue;
        }
        const mismatch = pairs.find(([row, entry]) => rowLabel(row) !== expectedLabel(entry, summaries));
        if (mismatch !== undefined) {
          attempts.push({ rootId, reason: 'label', rows: rows.length,
            rowLabel: rowLabel(mismatch[0]),
            expectedLabel: expectedLabel(mismatch[1], summaries),
            entryId: mismatch[1].id, entryName: mismatch[1].name || null });
          continue;
        }
        for (const [row, entry] of pairs) applyBadge(row, models.get(entry.id));
        return { rootId, pairs, attempts };
      }
      return { rootId: null, pairs: [], attempts };
    }

    /** Pull missing model selections for visible paired rows. */
    function refreshMissing(pairs, projections) {
      if (sessionsService === null) return;
      for (const [, entry] of pairs) {
        const child = projections ? projections[entry.id] : undefined;
        if (child && child.values && child.values.modelSelection) continue;
        Promise.resolve(sessionsService.refreshProjections(entry.id)).catch(() => {});
      }
    }

    /**
     * Root-panel footer seat: mounts only while the root session's subagent
     * panel is open and badges that panel's rows by structural pairing.
     */
    function SubagentModels(props) {
      const anchor = React.useRef(null);
      const useSessions = props.useSessions;
      const projections = useSessions ? useSessions(state => state.projectionsBySession) : undefined;
      const rootEntries = projections && projections[props.sessionId] && projections[props.sessionId].values
        ? projections[props.sessionId].values.subagentCatalog
        : undefined;
      const models = React.useMemo(() => modelMapOf(projections), [projections]);
      React.useEffect(() => {
        const anchorElement = anchor.current;
        if (anchorElement === null || models.size === 0) return undefined;
        const home = anchorElement.closest('[data-subagent-panel]');
        if (home === null) return undefined;
        const sync = () => syncHomePanel(home, rootEntries, projections, models);
        const pairs = sync();
        lastDebug = { ...lastDebug, home: {
          rootSessionId: props.sessionId,
          pairedRows: pairs.map(([, entry]) => ({
            id: entry.id,
            name: entry.name || null,
            model: models.get(entry.id) === undefined ? 'unmapped' : models.get(entry.id),
          })),
        } };
        refreshMissing(pairs, projections);
        const observer = new MutationObserver(sync);
        observer.observe(home, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
      }, [models, rootEntries, projections]);
      return React.createElement('span', { ref: anchor, hidden: true });
    }

    /**
     * Always-mounted header-actions seat: renders in every session header (root
     * and subagent conversations), so it covers every subagent panel. Badges a
     * panel only when one of its candidate root sessions (this conversation's
     * own and its parent's catalogs) verifies against every rendered row; a
     * panel that verifies against nothing stays untouched.
     */
    function SubagentModelsHeader(props) {
      const useSessions = props.useSessions;
      const useSession = props.useSession;
      const projections = useSessions ? useSessions(state => state.projectionsBySession) : undefined;
      const summaries = useSessions ? useSessions(state => state.byId) : undefined;
      const address = useSession
        ? useSession(session => (session.subagent && session.subagent.address) || null)
        : null;
      const models = React.useMemo(() => modelMapOf(projections), [projections]);
      const candidateRoots = React.useMemo(() => {
        /** The parent of a subagent session, from summaries or loaded catalogs. */
        const parentOf = (sid) => {
          const summary = summaries ? summaries[sid] : undefined;
          if (summary && summary.origin === 'subagent' && summary.parentId) return summary.parentId;
          if (projections) {
            for (const id of Object.keys(projections)) {
              const entries = projections[id] && projections[id].values
                ? projections[id].values.subagentCatalog
                : undefined;
              if (Array.isArray(entries) && entries.some(one => one.id === sid)) return id;
            }
          }
          return null;
        };
        const roots = [];
        const seen = new Set();
        const add = (id) => { if (id && !seen.has(id)) { seen.add(id); roots.push(id); } };
        // Panels in this header can root at the current session or at any
        // ancestor's catalog, so every ancestor must be a candidate.
        add(props.sessionId);
        let cursor = address !== null && address.parentSessionId
          ? address.parentSessionId
          : parentOf(props.sessionId);
        for (let guard = 0; cursor !== null && guard < 16; guard++) {
          add(cursor);
          cursor = parentOf(cursor);
        }
        return roots;
      }, [props.sessionId, address, summaries, projections]);
      React.useEffect(() => {
        const sync = () => {
          const allPairs = [];
          const matchedRoots = [];
          const panelReports = [];
          const panels = Array.from(document.querySelectorAll('[data-subagent-panel]'));
          for (const panel of panels) {
            const result = syncForeignPanel(panel, candidateRoots, projections, summaries, models);
            if (result === null) {
              matchedRoots.push('empty');
              panelReports.push({ matchedRoot: 'empty', attempts: [] });
              continue;
            }
            matchedRoots.push(result.rootId);
            panelReports.push({ matchedRoot: result.rootId, attempts: result.attempts });
            for (const pair of result.pairs) allPairs.push(pair);
          }
          return { panels: panels.length, matchedRoots, panelReports, pairs: allPairs };
        };
        const result = sync();
        lastDebug = { ...lastDebug, lineage: {
          sessionId: props.sessionId,
          candidateRoots,
          panels: result.panels,
          matchedRoots: result.matchedRoots,
          panelReports: result.panelReports,
          pairedRows: result.pairs.map(([, entry]) => ({
            id: entry.id,
            name: entry.name || null,
            model: models.get(entry.id) === undefined ? 'unmapped' : models.get(entry.id),
          })),
        } };
        refreshMissing(result.pairs, projections);
        const observer = new MutationObserver(() => { sync(); });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
      }, [models, candidateRoots, projections]);
      return null;
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        sessionsService = ctx.sessions;
        window.__subagentModelsDebug = () => lastDebug;
        ctx.effect(() => {
          const style = document.createElement('style');
          style.textContent = '[data-subagent-panel][role="dialog"]'
            + '{--dsh-subagent-menu-width:min(460px,calc(100vw - 32px));}';
          document.head.appendChild(style);
          return () => style.remove();
        }, 'subagent-models: panel width');
        ctx.slots.inject('conversation.session.header.actions.subagent.footer', () => ctx.slots.register({
          name: 'conversation.session.header.actions.subagent.footer',
          id: 'subagent-models',
        }, SubagentModels));
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'subagent-models',
          order: 15,
        }, SubagentModelsHeader));
      },
    };
  },
});
