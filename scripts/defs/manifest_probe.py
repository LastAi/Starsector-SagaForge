import os, re, csv, json, sys


def ids(core):
    out = {}

    def walk(rel, exts):
        base = os.path.join(core, rel)
        s = set()
        for d, _, fs in os.walk(base):
            for f in fs:
                if f.lower().endswith(exts):
                    s.add(os.path.relpath(os.path.join(d, f), core).replace(os.sep, '/'))
        return s

    def csvids(rel, col='id'):
        with open(os.path.join(core, rel), encoding='utf-8', errors='replace') as fh:
            return {r[col].strip() for r in csv.DictReader(fh) if r.get(col) and r[col].strip() and not r[col].startswith('#')}

    def keys(rel, pat):
        with open(os.path.join(core, rel), encoding='utf-8', errors='replace') as fh:
            return set(re.findall(pat, fh.read(), re.M))

    out['factions'] = {os.path.basename(x)[:-8] for x in walk('data/world/factions', ('.faction',))}
    out['variants'] = {os.path.basename(x)[:-8] for x in walk('data/variants', ('.variant',))}
    out['hulls'] = csvids('data/hulls/ship_data.csv')
    out['weapons'] = csvids('data/weapons/weapon_data.csv')
    out['wings'] = csvids('data/hulls/wing_data.csv')
    out['hullmods'] = csvids('data/hullmods/hull_mods.csv')
    out['commodities'] = csvids('data/campaign/commodities.csv')
    out['specials'] = csvids('data/campaign/special_items.csv')
    out['conditions'] = csvids('data/campaign/market_conditions.csv')
    out['industries'] = csvids('data/campaign/industries.csv')
    out['skills'] = csvids('data/characters/skills/skill_data.csv')
    out['entityTypes'] = keys('data/config/custom_entities.json', r'^\t"([A-Za-z0-9_]+)"\s*:\s*\{')
    out['portraits'] = walk('graphics/portraits', ('.png', '.jpg'))
    out['images'] = walk('graphics/illustrations', ('.png', '.jpg')) | walk('graphics/icons', ('.png',))
    out['settingsGraphicsKeys'] = keys('data/config/settings.json', r'^\t\t\t"([A-Za-z0-9_]+)"\s*:\s*"graphics/')
    out['music'] = keys('data/config/sounds.json', r'^\s*"(music_[A-Za-z0-9_]+)"\s*:')
    rules = set()
    for rel in ('data/campaign/rules.csv', 'data/campaign/rules/askoniaCrisis2.csv'):
        if os.path.exists(os.path.join(core, rel)):
            rules |= csvids(rel)
    out['ruleIds'] = rules
    return out


a = ids(sys.argv[1])
b = ids(sys.argv[2])
total = 0
for k in a:
    add = sorted(b[k] - a[k])
    rem = sorted(a[k] - b[k])
    total += len(json.dumps(sorted(b[k])))
    print(f"{k:22} {len(a[k]):6} -> {len(b[k]):6}  +{len(add):<5} -{len(rem):<4} e.g. +{add[:3]} -{rem[:3]}"[:240])
print('approx manifest bytes (0.98.5a, ids only):', total)
