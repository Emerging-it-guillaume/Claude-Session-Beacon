# Identifier un onglet de session par jointure sur le titre de conversation

VS Code n'expose d'un onglet de session que son étiquette et son type de webview
(`claudeVSCodePanel`) : rien qui porte le `pid` ni le `sessionId`. L'extension Claude
maintient bien la correspondance en interne (`sessionPanels: Map<sessionId, panel>`) mais
n'exporte aucune API. Nous reconstituons donc l'identité par **jointure sur le titre de
conversation** : l'étiquette de l'onglet actif est comparée au titre de chaque session
candidate, ce qui donne le `sessionId`, donc l'entrée de registre, donc le **nom de pair**.

La jointure se fait **par préfixe de 24 caractères**, et non par égalité — voir *Mécanique
vérifiée* ci-dessous.

## Considered Options

- **Appariement temporel à la création** — coupler un nouvel onglet à une nouvelle entrée
  de registre apparue au même instant. Rejeté : ambigu au rechargement de la fenêtre (N
  panneaux restaurés et N processus relancés d'un bloc) et lors d'ouvertures simultanées.
  L'état vit en mémoire et se perd, alors que la jointure par titre se recalcule à froid.
- **Récence d'écriture du transcript** — rejeté : ne réagit pas à un changement d'onglet,
  seulement à une frappe.
- **Portée fenêtre sans identification d'onglet** — afficher toutes les sessions de la
  fenêtre. Rejeté : ne répond pas au besoin, mais conservé comme information d'infobulle.

## Mécanique vérifiée

Mesurée en conditions réelles sur l'extension Claude **2.1.228** ([issue #1][spike]). Les
trois valeurs ci-dessous ont été observées, pas déduites d'une lecture du binaire.

**Le titre de conversation n'est pas toujours l'`ai-title`.** Un `custom-title` le supplante
et **rend collants** tous les `ai-title` ultérieurs, qui sont alors ignorés :

```js
if (c.type === "custom-title" && c.customTitle) o = c.customTitle, s = true;
else if (c.type === "ai-title" && c.aiTitle && !s) o = c.aiTitle;
```

Lire donc le **dernier `custom-title`** s'il en existe un, et à défaut seulement le
**dernier `ai-title`**.

**L'étiquette est une troncature du titre, faite à la source.** Ce n'est pas VS Code qui
tronque : un titre de 123 caractères posé sur une webview témoin ressort intact par
`tab.label`. C'est la webview de l'extension Claude qui coupe avant de renommer l'onglet.

```text
étiquette = titre                       si titre.length <= 25
          = titre.slice(0, 24) + "…"    sinon          (U+2026, un seul caractère)
          = "Claude Code"               si pas de titre
```

**Le `viewType` rendu par l'API est préfixé** : `mainThreadWebview-claudeVSCodePanel`, et
non `claudeVSCodePanel`. Un test d'égalité échoue ; il faut un test de suffixe. Le nom de
constructeur, lui, est minifié (`"ag"`) : seul `instanceof vscode.TabInputWebview` tient.

## Consequences

- **La comparaison se fait par reconstruction, pas par `startsWith`.** Le `…` final
  n'appartient pas au titre : on reconstruit l'étiquette attendue à partir de chaque titre
  candidat, puis on teste l'égalité stricte. Un `startsWith` sur l'étiquette brute
  comparerait un caractère qui n'existe dans aucun titre.
- **Le pouvoir discriminant tombe à 24 caractères.** Deux sessions dont les titres
  partagent leurs 24 premiers caractères sont indistinguables. La *session indéterminée*
  est donc un état bien plus fréquent qu'un simple cas limite — c'est le régime nominal
  pour des titres de même famille (« Corriger le bug de… », « Traiter le ticket… »).
- **Nous dépendons de quatre détails non contractuels** d'un autre produit : le type de
  webview `claudeVSCodePanel`, l'emplacement du registre, les types d'enregistrement
  `ai-title` et `custom-title`, et **le seuil de troncature à 25/24 caractères**. Ce
  dernier est le plus fragile : c'est une constante d'affichage, qu'Anthropic peut changer
  sans que rien ne le signale. Une dérive se traduira par une *session indéterminée*
  permanente, jamais par un nom de pair faux.
- **`ai-title` est réécrit en continu** — il faut lire le **dernier**, donc la fin du
  fichier, jamais le début.
- **Deux trous assumés**, qui produisent une *session indéterminée* et jamais un nom faux :
  un onglet neuf n'a pas encore de titre (étiquette `"Claude Code"`), et deux onglets
  peuvent porter la même étiquette.

[spike]: https://github.com/Emerging-it-guillaume/Claude-Session-Beacon/issues/1#issuecomment-5267867370
