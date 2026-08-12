# Identifier un onglet de session par jointure sur le titre de conversation

VS Code n'expose d'un onglet de session que son étiquette et son type de webview
(`claudeVSCodePanel`) : rien qui porte le `pid` ni le `sessionId`. L'extension Claude
maintient bien la correspondance en interne (`sessionPanels: Map<sessionId, panel>`) mais
n'exporte aucune API. Nous reconstituons donc l'identité par **jointure sur le titre de
conversation** : l'étiquette de l'onglet actif est comparée au dernier enregistrement de
type `ai-title` du transcript de chaque session candidate, ce qui donne le `sessionId`,
donc l'entrée de registre, donc le **nom de pair**.

## Considered Options

- **Appariement temporel à la création** — coupler un nouvel onglet à une nouvelle entrée
  de registre apparue au même instant. Rejeté : ambigu au rechargement de la fenêtre (N
  panneaux restaurés et N processus relancés d'un bloc) et lors d'ouvertures simultanées.
  L'état vit en mémoire et se perd, alors que la jointure par titre se recalcule à froid.
- **Récence d'écriture du transcript** — rejeté : ne réagit pas à un changement d'onglet,
  seulement à une frappe.
- **Portée fenêtre sans identification d'onglet** — afficher toutes les sessions de la
  fenêtre. Rejeté : ne répond pas au besoin, mais conservé comme information d'infobulle.

## Consequences

- **Nous dépendons de trois détails non contractuels** d'un autre produit : le type de
  webview `claudeVSCodePanel`, l'emplacement du registre, et le type d'enregistrement
  `ai-title`. Anthropic peut casser n'importe lequel dans une version mineure.
- **`ai-title` est réécrit en continu** — il faut lire le **dernier**, donc la fin du
  fichier, jamais le début.
- **Deux trous assumés**, qui produisent une *session indéterminée* et jamais un nom faux :
  un onglet neuf n'a pas encore de titre (étiquette `"Claude Code"`), et deux onglets
  peuvent porter le même titre.
