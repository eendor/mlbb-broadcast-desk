const fs = require('fs');
const path = require('path');

let catalog = { heroes: [], items: [] };
try {
  catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets/catalog.json'), 'utf8'));
} catch (e) {
  // Graceful fallback if catalog file is unavailable
}

class CatalogMatch {
  static get catalog() {
    return catalog;
  }

  static matchItem(name) {
    if (!name) return null;
    const id = typeof name === 'object' ? name.id : /^\d+$/.test(String(name)) ? Number(name) : null;
    const byId = id && catalog.items?.find(item => String(item.id) === String(id));
    if (byId) return { id: byId.id, name: byId.name, icon: byId.icon };
    if (typeof name === 'object') name = name.name;
    if (!name) return null;
    const clean = s => String(s).toLowerCase().replace(/\bshoes\b/g, 'boots').replace(/[^a-z0-9]/g, '');
    const target = clean(name);
    if (!target) return null;
    let found = catalog.items?.find(i => clean(i.name) === target);
    if (!found && target.length >= 4) {
      const matches = catalog.items?.filter(i => {
        const c = clean(i.name);
        return c.startsWith(target) || (c.length >= 5 && target.startsWith(c));
      });
      if (matches?.length === 1) found = matches[0];
    }
    if (found) {
      return { id: found.id, name: found.name, icon: found.icon };
    }
    return { id: 0, name: String(name).trim(), icon: '' };
  }

  static matchHero(name) {
    if (!name) return '';
    const clean = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = clean(name);
    if (!target) return '';
    const botMatch = String(name).match(/\[Computer\]\s*([A-Za-z0-9\s'-]+)/i);
    const candidate = botMatch ? clean(botMatch[1]) : target;
    let found = catalog.heroes?.find(h => clean(h.name) === candidate);
    if (found) return found.name;
    if (candidate.length >= 3) {
      found = catalog.heroes?.find(h => {
        const c = clean(h.name);
        return c.startsWith(candidate) || (candidate.length >= 4 && candidate.startsWith(c));
      });
      if (found) return found.name;
    }
    return botMatch ? botMatch[1].trim() : String(name).trim();
  }
}

module.exports = CatalogMatch;
