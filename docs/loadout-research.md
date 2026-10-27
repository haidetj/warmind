# WARMIND research: Helldivers 2 loadout and squad-composition rules

Compiled 2026-10-27. Current live patch is **7.2.0 "Devoid of Liberty" (20 Oct 2026)**. The patches that matter most here are 7.0.0 (12 Aug 2026), 7.0.2 (25 Aug 2026), 7.1.0 (22 Sep 2026), 7.2.0 (20 Oct 2026) and 6.3.0 (16 Jun 2026).

**Method and limits.** Only WebSearch worked in this environment. It returns summarised snippets, not full pages, so every claim below comes from a search summary of the cited page, not from reading that page. Confidence tags:
- **[confirmed]** Two or more sources agree, or the source is a wiki or patch-note page.
- **[single-source]** One source only, or the source is a community or commercial guide.
- **[uncertain]** Sources conflict, or the point is my own game knowledge that no search confirmed. The coach should treat these as soft priors, not hard rules.

Item names below match `app/warmind/data/items.yaml` where that file has the item.

---

## 1. Hard per-diver constraints

### 1.1 Support weapons: one in hand
- **[confirmed]** A diver has **one support-weapon slot**. If you pick up a second support weapon, including an expendable like the EAT, you drop the one you were holding and have to walk back for it.
  - Sources: Expendable-Carry mod README, ~Oct 2026 ([GitHub](https://github.com/Th3chef/Expendable-Carry), [ayakamods](https://ayakamods.com/mods/expendable-carry.5092/)). The mod only exists to work around this base-game limit.
  - Game8 also says "you can only carry one support weapon and one backpack at a time" (undated, probably 2024) ([game8](https://game8.co/games/Helldivers-2/archives/446094)).
- **[confirmed]** The loadout screen will *let* you equip two support-weapon stratagems. Calling the second one only drops a pod with a weapon you then have to swap to. So two "real" support weapons on one diver waste a slot.
  - One exception gets mentioned: one diver brings two supports so teammates can share them. That comes from a Reddit comment (Sep 2024) and is a fringe, coordination-heavy play ([reddit mirror](https://reddit.birdcat.cafe/r/helldivers2/comments/1fgowg4/thoughts/ln3nq7e)).
- **[confirmed]** A Super Helldive guide's role template recommends **one support weapon plus two damaging stratagems** per diver. That is the conventional shape ([game8](https://game8.co/games/Helldivers-2/archives/446094), undated).

### 1.2 Expendable support weapons, and why they pair with a "real" one
- **[confirmed]** **EAT-17 Expendable Anti-Tank**: 2 launchers per call-in, about 70 s base cooldown, and disposable.
  - The wiki explicitly describes it as "a supplement to a more regularly carried Support Weapon, only being called down upon encountering armored targets". You fire it, drop it, then pick your main support weapon back up.
  - Sources: [wiki EAT-17](https://helldivers.wiki.gg/wiki/EAT-17_Expendable_Anti-Tank) (2026 wiki revision); [Prima Games](https://primagames.com/tips/helldivers-2-is-the-eat-17-or-recoilless-rifle-better) (2024).
- **[confirmed]** **MLS-4X Commando**: 4 laser-guided rockets per call-in, 120 s base cooldown, cannot be reloaded ([wiki Commando](https://helldivers.wiki.gg/wiki/MLS-4X_Commando), last updated for patch 1.006.x, early 2026).
- **[confirmed]** Other expendables named in recent sources:
  - MGX-42 (an expendable machine gun).
  - Solo Silo designator and C4 detonator, which are "utility" items that also take the support slot.
  - Sources: Expendable-Carry and Utility Support Slot mod pages, ~Oct 2026 ([1](https://github.com/Th3chef/Expendable-Carry), [2](https://ayakamods.com/mods/utility-support-slot.5107/)).
- **[confirmed]** Since patch 7.0.0 the loadout UI marks backpack-fed weapons with a backpack icon, and non-reloadable expendables with a "drop weapon" icon ([fandomwire 7.0](https://fandomwire.com/helldivers-2-7-0-weapon-stratagem-changes-explained/), Aug 2026; [playday patch notes](https://playday.one/2026/08/12/helldivers-2-update-full-patch-notes/), 12 Aug 2026).
- **Rule.** A second support-category stratagem is only acceptable if it is **expendable** (EAT, Commando) **and** the first one is a different, non-expendable weapon. Two expendables, or two non-expendables, on one diver is redundant.

### 1.3 Backpack slot
- **[confirmed]** One backpack per diver. Backpack-fed support weapons take that slot with their ammo pack, so they **cannot coexist with a Jump Pack, Shield Generator Pack, Supply Pack or Guard Dog** on the same diver.
  - Backpack-fed weapons in items.yaml: GR-8 Recoilless Rifle, AC-8 Autocannon, FAF-14 Spear, AMW-20 Apex (all `backpack: true`).
  - u.gg notes that picking a mobility backpack means "you can't carry ammo for the Recoilless Rifle".
  - Sources: [u.gg backpack tier list](https://u.gg/hd2/tier-list/helldivers-2-backpack-stratagem-tier-list) (Mar 2026, patch 6.1.1); [gfinity jump pack](https://www.gfinityesports.com/guides/helldivers-2-jump-pack) (2024); [wiki Jump Pack](https://helldivers.wiki.gg/wiki/LIFT-850_Jump_Pack).
- **[confirmed]** Backpack stratagems have long cooldowns: Jump Pack 480 s, Supply Pack 480 s. You are expected to call one per life ([wiki Supply Pack](https://helldivers.wiki.gg/wiki/B-1_Supply_Pack), [wiki Jump Pack](https://helldivers.wiki.gg/wiki/LIFT-850_Jump_Pack)).
- **[confirmed]** Non-backpack support weapons pair freely with any backpack: Quasar, EAT, Commando, Laser Cannon, MG-43, Stalwart, GL-21, Nova, Meltagun. That pairing is the standard "support + backpack" kit, for example MG-43 + Supply Pack, or Quasar + Jump Pack.

### 1.4 Team reload (changed in 7.0.0)
- **[confirmed]** Patch 7.0.0 (12 Aug 2026): assisted reload works if **either the shooter or the helper** wears the matching backpack. The helper no longer needs it.
  - Before 7.0.0, the loader had to carry the pack and the gunner could not wear it.
  - Arrowhead's stated reason was that the old version needed too much coordination.
  - Sources: [u.gg patch 7.0](https://u.gg/hd2/news/helldivers-2-adds-necromorphs-level-300-and-new-seaf-units-in-patch-7-0); [fandomwire 7.0](https://fandomwire.com/helldivers-2-7-0-weapon-stratagem-changes-explained/); [playday](https://playday.one/2026/08/12/helldivers-2-update-full-patch-notes/).
- **[confirmed]** A Recoilless Rifle self-reload is slow, so a buddy reload is a big speed-up ([game8 RR](https://game8.co/games/Helldivers-2/archives/446507), undated).
- **[single-source]** The Autocannon can be self-reloaded fast if a round stays chambered ([Steam thread](https://steamcommunity.com/app/553850/discussions/0/4206994473251418890), 2024).
- **Implication.** A Recoilless, Autocannon or Spear diver now benefits from **any** teammate standing next to them. The coach no longer needs to reserve a "loader" backpack slot.

### 1.5 Eagles
- **[confirmed]** Each Eagle stratagem has a fixed number of uses per rearm. When every Eagle payload is spent, Eagle-1 rearms automatically. You can also call Eagle Rearm early, once at least one use is gone.
  - Rearm takes **150 s base**, 120 s with Pit Crew Hazard Pay (-20%), and 108 s when you send it back early with uses still left (Advanced Crew Training).
  - **During the rearm, none of that diver's Eagles can be used.**
  - Sources: [wiki Eagle Rearm](https://helldivers.wiki.gg/zh/wiki/Eagle_Rearm); [u.gg eagle/orbital guide](https://u.gg/hd2/news/the-best-eagle-and-orbital-stratagems-to-choose-in-helldivers-2) (2026).
- **[confirmed]** The Expanded Weapons Bay ship module adds +1 use per rearm to every Eagle ([wiki Eagle Airstrike](https://helldivers.wiki.gg/wiki/Eagle_Airstrike); [u.gg eagle tier list](https://u.gg/hd2/tier-list/eagle-stratagem-tier-list), May 2026, patch 6.2.2).
- **[uncertain] Use counts conflict between sources.**
  - Eagle Airstrike: 2 base uses, 3 with the module (wiki).
  - Eagle 500kg Bomb: 1 base use (wiki), or 2 (u.gg, May 2026).
  - Eagle Cluster Bomb: about 4 to 5.
  - Eagle Napalm Airstrike: 2.
  - Each Eagle also has a ~15 s cooldown between uses.
  - Sources: [wiki 500kg](https://helldivers.wiki.gg/wiki/Eagle_500KG_Bomb); [wiki Napalm](https://helldivers.wiki.gg/wiki/Eagle_Napalm_Airstrike); [shacknews](https://shacknews.com/article/138705/all-stratagems-codes-helldivers-2) (2024).
- **Why two Eagles per diver is the usual cap** **[confirmed, community]**
  - All of a diver's Eagles share one rearm. Using one up to empty, or rearming early, also puts every other Eagle on that diver on the 120 to 150 s cooldown.
  - With three or more Eagles you sit on a long, shared dry spell and have to manage the rearm actively.
  - Players disagree: some argue three Eagles plus a support weapon is fine because one ~2 min rearm restocks all of them.
  - Sources: Steam threads, 2024 ([1](https://steamcommunity.com/app/553850/discussions/0/4302697675601568860), [2](https://steamcommunity.com/app/553850/discussions/0/4339851902701308524)); [afkgaming](https://afkgaming.com/gaming/general/what-is-eagle-rearm-and-how-does-it-work-in-helldivers-2).
  - **Coach rule:** two Eagles per diver is the soft maximum. Allow three only on an air-strike-specialist role, and flag it.
- **[uncertain] Is the Eagle per diver or shared by the squad?** One search summary inferred that the squad shares one Eagle-1. The wiki text it cited says "the Super Destroyer that the player controls". My game knowledge is that **each diver has their own Super Destroyer and Eagle-1, and their own rearm**, so two players each bringing an Airstrike do not drain each other. This is not verified by search. Treat squad-level Eagle duplication as a *redundancy* issue, not a *resource-conflict* issue.

### 1.6 Orbitals and sentries
- **[confirmed / uncertain mix] Orbital cooldowns.** Base values, before ship modules:

  | Orbital | Base cooldown | Notes |
  |---|---|---|
  | Orbital Precision Strike | ~90 s | Wiki codes page. Older pages say 80 or 100 s. |
  | Orbital Gas Strike | ~75 s | |
  | Orbital EMS Strike | ~75 s | |
  | Orbital Railcannon Strike | ~210 s | 2024 figure. One 2026 guide says it was "slightly reduced", with no number. |
  | Orbital Laser | 300 s | **3 uses per mission**: the only orbital-cannon stratagem with a fixed per-mission cap. |
  | Orbital Gatling Barrage | ? | Prima lists 210 s and 3 uses, which looks wrong. In my memory it is ~70 s. **[uncertain]** |
  | Orbital Airburst Strike | 90 s | Cut from 100 s in 7.2.0. Not in items.yaml. |

  - Ship modules cut orbital cooldowns by about 10% (Zero-G Breech Loading) and all stratagems by about 5% (Morale Augmentation).
  - Sources: [wiki stratagem codes](https://helldivers.wiki.gg/wiki/Stratagem_Codes_(Helldivers_2)); [wiki Orbital Laser](https://helldivers.wiki.gg/wiki/Orbital_Laser) (2026); [Prima all stratagems](https://primagames.com/gaming/all-stratagems-and-how-to-unlock-them-in-helldivers-2) (undated); [Steam cooldown list](https://steamcommunity.com/app/553850/discussions/0/4298194451993206381) (Mar 2024); [SteamDB 7.2.0](https://steamdb.info/patchnotes/25988413/) (20 Oct 2026).
- **[confirmed]** Patch 6.3.0 (16 Jun 2026) gave **every sentry +100% health**. That makes static defence much more durable than older guides assume ([u.gg 6.3.0 notes](https://u.gg/hd2/news/hd2-update-6-3-0-patch-notes); [expcarry](https://expcarry.com/helldivers-2-machinery-of-oppression-patch-6-3-0)).
- **[confirmed]** Sentries shoot through friendly Helldivers. Place them so they don't fire across your squad ([GGRecon](https://ggrecon.com/guides/rescue-science-teams-civilians), 2024).
- **[uncertain] Sentry cooldowns** are roughly 90 to 180 s. These are my game knowledge, not searched: MG Sentry ~90 s; Gatling, Autocannon and Tesla ~150 s; Mortar ~180 s.

### 1.7 Exosuits and vehicles
- **[confirmed]** Patch 6.3.0 raised Exosuit arm health from 600 to 800 and leg health from 400 to 550, and raised Exosuit and FRV body health ([u.gg 6.3.0](https://u.gg/hd2/news/hd2-update-6-3-0-patch-notes)).
- **[single-source]** Neonsect says Exosuit cooldown dropped from 10 to 8 min in 6.3 ([neonsect](https://neonsect.com/helldivers-2/helldivers-2-patch-6-3-meta-stratagems-exosuits/)).
- Exosuits and vehicles are **not in items.yaml**, so there are no rules for them. If they are added later: one per diver, and they are long-cooldown commitments.

### 1.8 Sensible stratagem shape per diver (synthesis)
- Default: **1 support weapon, 1 backpack (or a second offensive pick if the support is backpack-fed), then 2 offensive or defensive picks.** Game8 and the Switchblade role guides agree on this.
- Eagles: at most 2. Orbitals: 2 is fine, because their cooldowns are independent. Sentries or emplacements: 1 to 3 is fine on static missions.
- Avoid kits with **zero sustained damage source**, meaning no support weapon and nothing with a short cooldown, except on deliberate "fires" roles.

---

## 2. Squad-level rules

### 2.1 Well-rounded versus redundant
- **[single-source, 26 Apr 2026]** Switchblade: four players share **16 stratagem slots**, and "how you allocate those 16 slots is the composition decision". The template is four roles: **Anti-Armor, Support, Crowd-Control, Assault/Flex**. Builds are given for all three factions ([switchblade team comps](https://www.switchbladegaming.com/helldivers-2/best-team-compositions/)).
- **[single-source]** Switchblade beginner's guide (2026): the roles are Anti-Tank (heavy weapon + supply pack), Crowd Control, Scout (jet pack, marksman rifle, ping discipline) and Flex ([switchblade beginners 2026](https://www.switchbladegaming.com/helldivers-2/beginners-guide-20/)).
- **[community, 2025–2026]** Squad checklists say:
  - **Exactly one diver runs the B-1 Supply Pack.**
  - **No two divers carry the same support weapon.**
  - **At least one diver carries a crowd-control stratagem.**
  - "Three players on the same role wastes 8 of those slots on redundant output."
  - Super Helldive: the anti-armor role carries **two** anti-armor stratagems; 1 to 2 anti-tank specialists per squad.
  - The search summary merged these sources, so I can't attribute each point to one page: [tacticalgamehub](https://tacticalgamehub.com/blog/helldivers-2-best-loadouts-squad), [PWM-pro](https://pwm-pro.com/blog/post/helldivers-2-squad-cooperation-guide-best-team-strategies-for-missions), [game-rack terminid comp](https://www.game-rack.com/en/articles/en-helldivers-2-terminid-team-loadouts-1157), [neonsect](https://neonsect.com/helldivers-2/helldivers-2-super-helldive-guide/).
- **[single-source, Sep 2026]** BitTopup: duplicating four identical kits "leaves blind spots against faction-specific threats" ([bittopup](https://bittopup.com/article/helldivers-2-best-loadouts-super-helldive-2026)).

### 2.2 Coverage floors (synthesis; thresholds are editorial)
These map onto the items.yaml coverage axes: `at` heavy armour, `st` structures, `ch` chaff, `bc` break contact.

| Squad size | Anti-tank (`at`) | Chaff (`ch`) | Structures (`st`) | Break contact (`bc`) |
|---|---|---|---|---|
| 4 | ≥2 divers with a heavy_pen support weapon, plus ≥1 at-capable strike (500kg, Railcannon, OPS, Orbital Laser) | ≥2 independent sources (MG/Stalwart/GL support, sentry, cluster/napalm/gas strike) | ≥2 sources | ≥1 tool (smoke, stun, EMS, shield) |
| 2–3 | ≥1 diver with heavy_pen support weapon, plus another at source (strike, Thermite, EAT) | at least 1 source | at least 1 source | |

- For 2–3 player squads, every diver must be more self-sufficient. Prefer **non-backpack or self-reloading AT** (Quasar, EAT, Autocannon) over RR or Spear, because buddy reloads are rarer.
  - timesaver (7.0.2, Aug 2026) recommends **Quasar for solo and Recoilless for teams** on bugs ([timesaver terminid](https://timesaver.gg/blog/helldivers-2-best-terminid-loadout)).

### 2.3 Duplicates
- **Same support weapon twice: avoid** (community checklist above).
- **Same Eagle or orbital twice: low value.** It mainly adds redundancy, not depth.
  - Exceptions where stacking is good:
    - **Shield Generator Relay on Automaton missions.** One player reports "four relays vs bots, took almost no damage", and calls it worthless vs bugs ([Steam](https://steamcommunity.com/app/553850/discussions/0/4298194451988409845), 2024, anecdotal).
    - **Sentries on defense missions**, since 6.3.0 doubled their health.
    - **EAT on very-high-armour missions.**
- **B-1 Supply Pack: one per squad.**
  - Each pack holds 4 shareable resupply boxes, on a 480 s cooldown.
  - The wiki asks players to communicate before taking more than one box.
  - Patch 1.006.001 (3 Feb 2026) stopped packs being used on divers who are already full.
  - Source: [wiki Supply Pack](https://helldivers.wiki.gg/wiki/B-1_Supply_Pack).
- Two or more Jump Packs: fine for mobility squads. In combat squads it is usually an AT-depth cost, because jump-pack divers can't run RR, AC or Spear.

### 2.4 Who carries what (synthesis)
- **Anti-armour diver.** Backpack-fed AT (RR, Spear, AC, Apex), or Quasar plus EAT.
  - Since 7.0 they can wear their own pack and still be buddy-reloaded by anyone.
  - Switchblade: the support player handles reloads so the CC player stays in position.
- **Support diver.** Supply Pack or Shield Generator Pack, a non-backpack support weapon (MG-43, Stalwart, GL-21), and a relay or sentry.
- **Crowd-control diver.** Cluster, Napalm or Gas, plus Gatling or Mortar sentry, or GL-21 or MG-43.
- **Flex or Scout.** Jump Pack plus Quasar or Laser Cannon, Orbital Precision Strike. Handles poor intel and side objectives.

---

## 3. Synergies and anti-synergies

### 3.1 Synergies
- **Stun grenade with heavy follow-up** **[confirmed]**
  - Stun "affects all enemies except Tanks, allowing you to easily deploy an Eagle 500KG to eliminate Hulks" ([u.gg shield-hero bot build](https://u.gg/hd2/builds/shield-hero-bot-slayer), 2025–26).
  - Stun holds Hulks still for weak-spot shots ([videogamer](https://www.videogamer.com/?p=469487), 2024).
  - Stun plus an anti-tank head shot on Chargers ([Steam](https://steamcommunity.com/app/553850/discussions/0/4353373240379529977)).
  - The Illuminate Gatekeeper (added Mar 2026) "needs a stun and a flanking partner" ([switchblade illuminate](https://www.switchbladegaming.com/helldivers-2/illuminate-enemy-guide/), 2026).
  - Item mapping: `G-23 Stun` with `Eagle 500kg Bomb`, `Orbital Precision Strike`, `Orbital Railcannon Strike`, `GR-8 Recoilless Rifle`, `EAT-17`.
- **[confirmed] Autocannon or AMR with Shield Generator Pack on Automatons.** timesaver calls it the strongest general anti-bot setup, and the shield pack the best backpack vs bots ([timesaver automaton](https://timesaver.gg/blog/helldivers-2-best-automaton-loadout), 7.0.0, Aug 2026).
  - Caveat: the Autocannon is itself backpack-fed. **AC + Shield Pack cannot be on the same diver.** The guide must mean AMR + Shield, or AC on one diver with Shield on another. **[uncertain wording in source]** In items.yaml the backpack-free pairing is `LAS-99 Quasar Cannon` or `LAS-98 Laser Cannon` with `SH-32 Shield Generator Pack`.
- **[confirmed] Non-backpack support with a utility backpack.** Examples: MG-43 + Supply Pack; Quasar + Jump Pack or Shield Pack. This follows from the one-backpack rule.
- **[confirmed] Primary and support splitting armour roles.** Every 2026 guide pairs a chaff primary with a heavy-pen support weapon. For bugs: SG-225IE Breaker Incendiary + Quasar or RR, with Thermite + GP-31 ([timesaver terminid](https://timesaver.gg/blog/helldivers-2-best-terminid-loadout), 7.0.2).
  - Rule: if the support weapon is `ch`-only (MG, Stalwart), the diver needs `at` from a grenade (Thermite, Meltamine), a strike, or a squadmate.
  - Rule: if the support is AT, the primary should be `ch`.
- **[confirmed] EAT or Commando as a secondary support** next to a non-expendable main weapon. Fire it, drop it, re-pick the main ([wiki EAT](https://helldivers.wiki.gg/wiki/EAT-17_Expendable_Anti-Tank)).
- **[confirmed] Buddy reload.** Any teammate can now speed up an RR, AC or Spear gunner (7.0.0).
- **[single-source] Shield Relay stacking against Automatons.** Also "gathers enemies into a cluster for area stratagems" ([game8 relay](https://game8.co/games/Helldivers-2/archives/446532)).
- **[single-source] EMS (orbital or mortar) stun to set up strikes or hold objectives** ([afkgaming](https://afkgaming.com/gaming/general/heres-the-best-loadout-to-defeat-the-automatons-in-helldivers-2), 2024).
- **[uncertain] Smoke on objectives against Automatons.**
  - Neonsect recommends smoke vs bots for extraction ([neonsect](https://neonsect.com/helldivers-2/helldivers-2-super-helldive-guide/)).
  - The "smoke + orbital" combo source was low-quality. Treat smoke + objective as a sensible but weakly sourced synergy.
- **[confirmed] Thermite vs AA emplacements.** Thermite one-shots an Anti-Air Emplacement if it sticks ([wiki AA Emplacement](https://helldivers.wiki.gg/wiki/Anti-Air_Emplacement)).

### 3.2 Anti-synergies
- **[confirmed, severity 3] Two backpack-occupying items on one diver.** This covers any backpack-fed support weapon (RR, AC, Spear, Apex) with any backpack stratagem (Jump, Shield, Supply, Guard Dog), and two backpack-fed weapons together.
- **[confirmed, severity 3] Two non-expendable support weapons on one diver.** You can hold only one.
- **[confirmed, severity 2] Two expendables on one diver**, or an expendable as the *only* support weapon on long missions. You lose sustained output.
- **[community, severity 2] Three or more Eagles on one diver.** Shared rearm means long dead time.
- **[confirmed, severity 2] Napalm or other fire on your own squad's lane.**
  - Friendly fire is always on.
  - Napalm Airstrike coverage was widened in 7.0.0, from 8 m to 10 m radius with spread-out bombs. That is better area denial but more team-kill risk.
  - The wiki tells you to throw incendiary barrages far from the squad.
  - Sources: [playday 7.0.0](https://playday.one/2026/08/12/helldivers-2-update-full-patch-notes/); [wiki Orbital Napalm](https://helldivers.wiki.gg/wiki/Orbital_Napalm_Barrage); [PC Gamer FF](https://pcgamer.com/helldivers-2-friendly-fire).
  - Fire also does poorly on Automatons; items.yaml grades already reflect this.
- **[confirmed, severity 2] Static kits on high-traversal missions.** Sentries, emplacements, mines and relay are left behind. This is already in mission_tag_modifiers (`high_traversal` sentry -0.3).
- **[single-source, severity 2] Shield Generator Relay on Terminids.** "Worthless vs bugs", because melee enemies walk inside the bubble ([Steam](https://steamcommunity.com/app/553850/discussions/0/4298194451988409845), 2024).
- **[confirmed, severity 1] Sentries placed across teammates** (they shoot through you). The same applies to Tesla Tower and mines **[uncertain for Tesla specifics]**.
- **[community, severity 2] The whole squad on the same support weapon or the same role** (section 2).

---

## 4. Faction meta notes (late 2026)

### 4.1 Terminids (timesaver 7.0.2, Aug 2026; gladiatorboost 2026; lfcarry 7.0.2)
- **Core kit:**
  - Primary: SG-225IE Breaker Incendiary (chaff).
  - Support: Quasar (solo) or Recoilless Rifle (team).
  - Grenade: G-123 Thermite. Secondary: GP-31 Grenade Pistol (closes bug holes).
  - Stratagems: **Eagle Airstrike, Orbital Gas Strike, Eagle 500kg Bomb**. Guard Dog Rover for solo.
  - Sources: [timesaver](https://timesaver.gg/blog/helldivers-2-best-terminid-loadout), [gladiatorboost](https://gladiatorboost.com/news/helldivers-2-2026-terminid-meta-guide-best-weapons-bug-loadouts/), [lfcarry](https://lfcarry.com/guides/helldivers-2-best-weapons).
- **What they punish:**
  - **Swarm volume and flanking.** Hunters, Pouncers and Warriors call for a high-rate chaff primary and area strikes.
  - **Heavy armour at close range.** Chargers and Bile Titans call for 2 or more AT sources; the 500kg is saved for Titans.
  - **Being static against melee.** The relay is weak here.
  - **Structures:** bug holes and nests need explosives (grenades, GP-31, GL-21, Eagles).
  - Sources: [gfinity bugs](https://www.gfinityesports.com/guides/helldivers-2-how-to-beat-terminids); [Steam charger/500kg](https://steamcommunity.com/app/553850/discussions/0/4353373240379529977).
- **Modifier:** Roving Shriekers spawn patrolling flying Shriekers ([wiki](https://helldivers.wiki.gg/zh/wiki/Roving_Shriekers)). That raises the value of anti-air chaff (MG, Autocannon).

### 4.2 Automatons (timesaver 7.0.0, Aug 2026; u4n 2026)
- **Core kit:**
  - Support: AC-8 Autocannon or Anti-Materiel Rifle.
  - Backpack: SH-32 Shield Generator Pack, "the single best backpack vs bots".
  - **Orbital Railcannon Strike** as the key red stratagem, plus **Eagle 500kg Bomb or Orbital Laser** for bases and Factory Striders.
  - Primary: a precise one that pops Devastator heads at range (Diligence Counter Sniper, Adjudicator, Scorcher).
  - Sources: [timesaver automaton](https://timesaver.gg/blog/helldivers-2-best-automaton-loadout); [u4n bot loadout](https://www.u4n.com/news/helldivers-2-best-bot-loadout-2026.html).
- Autocannon is "king" of bot missions: it handles fabricators, Gunships, Devastators and Scout Striders ([geniostack](https://geniostack.com/helldivers-2-automatons/), 2026).
- **[uncertain]** One tier list says the Railcannon is worse on bots; most guides rate it highly.
- **What they punish:**
  - **Exposure at range.** Rockets and Devastators mean you need shield, cover and smoke.
  - **Air.** Gunships and Gunship Patrols call for AC, Spear or RR ([esports.gg gunships](https://esports.gg/news/gaming/how-to-destroy-the-automaton-gunships-in-helldivers-2)).
  - **Structures:** fabricators, Gunship Facilities, Detector Towers, AA Emplacements and Jammers need explosive or demolition-force tools.
  - **Missions:** Commando Operations, Poor Intel and Jammers are bot-front features.
- **Fire is weak on bots.** Shield Relay is strong.

### 4.3 Illuminate (Power Up Gaming 8 Oct 2026; U4N Oct 2026; Switchblade 2026; timesaver 7.0.0)
- **Builds:**
  - Power Up Gaming (8 Oct 2026): LAS-17 Double-Edge Sickle primary, **A/MG-43 Machine Gun Sentry, Eagle Airstrike, Orbital Gatling Barrage, GR-8 Recoilless Rifle** ([powerupgaming](https://powerupgaming.co.uk/2026/10/08/helldivers-2-best-loadout-for-the-illuminate/)).
  - U4N (Oct 2026): Sickle, **AC-8 Autocannon**, Eagle Strafing Run ([u4n](https://www.u4n.com/news/helldivers-2-best-loadout-for-bugs-bots-illuminate-all-factions-terminids-2026.html)).
  - mmoexp (Aug 2026): LAS-13 Trident + Autocannon. The AC handles fliers, flesh, Crushers, Stingrays and Warships ([mmoexp](https://www.mmoexp.com/News/helldivers-2-illuminate-guide-2026-best-trident-autocannon-loadout-crusher-counters-wretch-tips-max-difficulty-strategy.html)).
- **Harvesters** (Switchblade 2026, [illuminate guide](https://www.switchbladegaming.com/helldivers-2/illuminate-enemy-guide/)):
  - Don't waste an EAT on the shield bubble.
  - Strip the shield with **MG-43**, then EAT the hip joints.
  - Destroying one shield generator with **Autocannon or AMR** disables the shield permanently.
  - Roguewiki rates the **Anti-Tank Emplacement** highly vs ships and Harvesters ([roguewiki](https://roguewiki.com/helldivers-2/guides/helldivers-2-illuminate-loadout)). It is not in items.yaml.
- **What they punish:**
  - **Low rate of fire against shields** (Overseers, Harvesters). Rapid-fire weapons strip shields ([gamerant](https://gamerant.com/helldivers-2-hd2-how-fight-illuminate-tips/)).
  - **Voteless or Fleshmob swarms.** Fire, gas and area strikes; the Mindless Masses modifier increases these spawns ([wiki effects](https://helldivers.wiki.gg/wiki/Effects_and_Modifiers)).
  - **Air:** Stingrays and Leviathans. Leviathans spawn in Megacities under the Leviathan Blockade modifier ([wiki](https://helldivers.wiki.gg/zh/wiki/Leviathan_Blockade)).
  - **Command units:** Gatekeepers need stun and a flank.
- **Energy and orbitals** are commonly recommended vs Illuminate ([deltias](https://deltiasgaming.com/?p=136410), undated).

### 4.4 Patches since mid-2026 worth encoding
- **6.3.0 (16 Jun):** sentry health +100%; Exosuit health raised.
- **7.0.0 (12 Aug):** assisted reload rework; Napalm Airstrike radius 8 m → 10 m; AT Mines demolition 30 → 40; backpack and expendable icons.
- **7.1.0 (22 Sep):** minor. Evacuate High-Value Assets made harder ([u.gg 7.1.0](https://u.gg/hd2/news/helldivers-2-patch-notes-7-1-0)).
- **7.2.0 (20 Oct):**
  - Orbital Airburst cooldown 100 → 90 s.
  - **Eagle Gas Airstrike demolition 50 → 40.** It no longer destroys structures that other Eagle bombs can't.
  - Maxigun lockout removed; Breaching Hammer charges up.
  - Sources: [SteamDB](https://steamdb.info/patchnotes/25988413/); [u.gg](https://u.gg/hd2/news/10-20-26-hd2-update); [accountshark](https://accountshark.net/blog/helldivers-2-patch-7-2-0-easy-anti-cheat-scope-of-authority-warbond-october-20).
- **Note for items.yaml:** Scope of Authority warbond items (Sightliner, Mist, Caltrops, Nova, Apex, Mimetic Marshal) came out alongside 7.2.0.

---

## 5. Mission modifiers, objectives and hazards

- **Stratagem Jammer** (Automaton tactical objective) **[confirmed]**
  - No stratagems inside its radius.
  - To clear it, use the terminal, then destroy it with a Hellbomb or any stratagem with **demolition force ≥ 50**.
  - If the whole squad dies inside the radius, reinforcements land at the edge.
  - Bring support weapons and strong primaries. Don't rely on Eagles or orbitals near it.
  - Sources: [wiki Jammer](https://helldivers.wiki.gg/wiki/Strategem_jammer); [zh wiki](https://helldivers.wiki.gg/zh/wiki/Stratagem_Jammer).
- **Anti-Air Emplacement** (Automaton) **[confirmed]**
  - Disables **Eagle stratagems within 150 m**.
  - Destroy it with non-Eagle offensive stratagems, emplacements, AT mines, AV4+ grenades (Thermite one-shots it), or a Hellbomb.
  - Completing "Compromise Automaton Defenses" switches the effect off.
  - Bring orbitals or Thermite; Eagles are dead weight near it.
  - Source: [wiki AA Emplacement](https://helldivers.wiki.gg/wiki/Anti-Air_Emplacement).
  - The old **"AA Defenses" operation modifier** (-1 stratagem slot) was **removed in patch 1.000.400** ([wiki effects](https://helldivers.wiki.gg/wiki/Effects_and_Modifiers)).
- **Complex Stratagem Plotting** **[uncertain magnitude]**
  - Stratagem call-in time is longer: +50% per the wiki, +100% per another guide.
  - Patch 1.000.200 halved the penalties from cooldown and call-in modifiers.
  - Favour carried support weapons and pre-placed, long-duration tools. Short-reaction Eagles lose value (their call-in is near zero, so the penalty is small in absolute terms). **[uncertain]**
  - Sources: [fandom op modifiers](https://helldivers.fandom.com/wiki/Operation_Modifiers); [wiki 1.000.200](https://helldivers.wiki.gg/wiki/1.000.200).
- **Orbital Fluctuations:** stratagem cooldown +25% ([wiki](https://helldivers.wiki.gg/wiki/Orbital_Fluctuations)). This penalises long-cooldown orbitals and backpacks most.
- **Slower Eagle Rearm:** rearm takes 25% longer ([wiki effects zh](https://helldivers.wiki.gg/zh/wiki/Effects)). Cap Eagles at 1 per diver.
- **Poor Intel** **[confirmed]**
  - Hides exact objective locations behind search radii.
  - Wiki: Automaton-exclusive. Switchblade: all fronts.
  - The Radar Station does **not** reveal the main objective under Poor Intel (Steam, Aug 2024).
  - Bring mobility (Jump Pack, light or scout armour), and split search duties.
  - Sources: [wiki Poor Intel](https://helldivers.wiki.gg/zh/wiki/Poor_Intel); [Steam](https://steamcommunity.com/app/553850/discussions/0/4428813423380634141); [switchblade modifiers](https://www.switchbladegaming.com/helldivers-2/mission-modifiers/).
- **Gunship Patrols** (bots), **Roving Shriekers** (bugs), **Leviathan Blockade** (Illuminate, Megacities): all add **air** threat. Bring AC, RR, Spear or MG ([wiki category](https://helldivers.wiki.gg/wiki/Category:Operation_Modifiers)).
- **Commando Operations** (Automaton) **[confirmed]**
  - The Super Destroyer is in low orbit for **1 min after the drop plus 1 more minute** via the "Call In Super Destroyer" stratagem.
  - You start with **zero reinforcements**. Activating 4 sets of Reinforcement Pods gives 3 each.
  - Bring carry-all-mission kit (support weapon, backpack), stealth and mobility.
  - Stealth kits are weak in long fights, so don't fully abandon firepower.
  - Sources: [wiki Commando Missions](https://helldivers.wiki.gg/wiki/Commando_Missions); [wiki Stealth](https://helldivers.wiki.gg/zh/wiki/Stealth); [wiki Stealth Mechanics](https://helldivers.wiki.gg/wiki/Stealth_Mechanics) (detected by sound, then sight).
- **Defense and evacuation missions**
  - Swap a slot for a sentry (EMS Mortar, Gatling, Autocannon) ([gamesradar](https://gamesradar.com/helldivers-2-builds-meta-best)).
  - A bot defense build: Autocannon, Shield Relay, AP Minefield, Mortar ([N4G](https://n4g.com/articles/helldivers-2-best-loadouts)).
  - Sentry health was doubled in 6.3.0.
  - Emergency Evacuation runs on a timed shuttle: 3 civilians every ~33 s ([wiki](https://helldivers.wiki.gg/zh/wiki/Emergency_Evacuation)).
  - Evacuate High-Value Assets was made harder in 7.1.0.
  - Defense Campaign planets are said to carry no operation modifiers ([switchblade](https://www.switchbladegaming.com/helldivers-2/mission-modifiers/), single-source).
- **City and Megacity maps** **[weak sourcing]**
  - Steam players: **Eagles work well because streets funnel enemies**; the Autocannon is "situational"; Jump Pack onto rooftops.
  - Urban fights make friendly fire and positioning more punishing.
  - The Civilians & SEAF in Area modifier applies to Megacity Defense campaigns.
  - Tall buildings likely block orbital and Eagle line-of-fire and hellpod landing. **[uncertain; not confirmed by search]**
  - Sources: [Steam city thread](https://steamcommunity.com/app/553850/discussions/0/599644966903393919); [wiki Civilians & SEAF](https://helldivers.wiki.gg/wiki/Civilians_and_SEAF_in_Area).

### Planetary hazards (the hazard ids in hazards.yaml)

| Hazard id | Effect and advice | Sources |
|---|---|---|
| **ion_storms** | **[confirmed]** Stratagems are intermittently disabled, **including Reinforce**, and the minimap goes dark. Bring your best carried weapons; avoid relying on strike-only kits. | [wiki Ion Storms](https://helldivers.wiki.gg/wiki/Ion_Storms), [game8](https://game8.co/games/Helldivers-2/archives/447219) (2024) |
| **extreme_cold** | **[confirmed]** About 10% lower rate of fire. Heat weapons *shed heat faster* (the wiki says the in-game text is misleading). Laser Cannon cools 33% faster. Energy kit gets better. | [wiki Extreme Cold](https://helldivers.wiki.gg/wiki/Extreme_Cold) |
| **intense_heat** | **[confirmed direction, uncertain mechanism]** Higher stamina drain; energy weapons overheat sooner, or shed heat slower per the wiki. Light armour and ballistics preferred. | [wiki Intense Heat](https://helldivers.wiki.gg/wiki/Intense_Heat) |
| **fire_tornadoes** | **[confirmed exists]** Roaming fire damage. Be mobile, use fire-resistant armour passives, and don't add more fire to the field. **[uncertain]** | 1.000.100 patch, Mar 2024 ([shacknews](https://shacknews.com/article/139018/helldivers-2-1000100-patch-notes)) |
| **meteor_storms** | **[confirmed]** Heavy surface impacts. Static setups get destroyed, so prefer mobile kits. A later patch cut spawn rate and blast radius. | [zh wiki env](https://helldivers.wiki.gg/zh/wiki/Environmental_Conditions), [siege.gg](https://siege.gg/news/planetary-hazards-receive-a-nerf-with-the-latest-helldivers-2-update) |
| **tremors** | **[confirmed]** Earthquakes stun everyone. Mildly raises the value of a shield or stagger-proofing. | [game8](https://game8.co/games/Helldivers-2/archives/447219) |
| **thick_fog** | **[confirmed]** Lightly reduces visibility for both sides. Long-range marksman and AT lose value; close-range kit and radar gain. | [zh wiki env](https://helldivers.wiki.gg/zh/wiki/Environmental_Conditions) |
| blizzards, sandstorms | Added in 1.000.200. Low visibility; same advice as fog. **[uncertain]** | [ggrecon 1.000.200](https://ggrecon.com/guides/helldivers-2-1-000-200-patch-notes) |
| volcanic_activity, acid_storms, rainstorms | No current sourcing found. **[uncertain]** Leave as they are in hazards.yaml. | |
