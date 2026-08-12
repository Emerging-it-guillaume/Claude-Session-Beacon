# Nommage des sessions Claude Code

Extension VS Code qui rend visible, à tout moment, l'identité de la session Claude Code
sur laquelle porte le focus — afin de pouvoir la désigner sans ambiguïté dans les
communications inter-sessions.

## Language

### Identité d'une session

**Session** :
Un processus `claude` vivant, inscrit au registre. Une session naît à son lancement et
meurt avec son processus.
_Avoid_: conversation, agent, instance

**Nom de pair** :
Le nom qui sert d'**adresse** à une session dans les échanges inter-sessions. Dérivé par
défaut de `basename(cwd)` + 2 hexadécimaux (`sentry-server-41`).
_Avoid_: nom de session, name

**Titre de conversation** :
Le résumé auto-généré du premier message. Sert d'**étiquette humaine**, jamais d'adresse.
_Avoid_: nom, titre de session

> Ces deux-là sont systématiquement confondus. Un **nom de pair** adresse ; un **titre de
> conversation** décrit. Ils ne coïncident jamais.

**Ref** :
Le discriminant court affiché entre crochets à côté d'un nom de pair (`sentry-server-ff
[57a8fe]`). Se relit toujours d'une sortie fraîche, ne se reconstruit jamais.

### Support

**Registre** :
`~/.claude/sessions/<pid>.json`, un fichier par session vivante. Écrit au démarrage,
supprimé à la sortie propre.
_Avoid_: liste des sessions, index

**Session fantôme** :
Une entrée du registre dont le processus est mort sans nettoyage (crash). Le registre seul
ne permet pas de la distinguer d'une session vivante.

**Transcript** :
Le fichier `~/.claude/projects/<slug>/<sessionId>.jsonl` où s'écrit l'historique d'une
session. Artefact de stockage, distinct de la Session elle-même.

### Surfaces VS Code

**Fenêtre** :
Une fenêtre VS Code, avec son propre hôte d'extensions et sa propre barre d'état. Unité
d'isolation : une extension ne voit jamais l'état d'une autre fenêtre.

**Onglet de session** :
Un panneau webview de type `claudeVSCodePanel` dans la zone d'édition. Une fenêtre peut en
contenir plusieurs.
_Avoid_: onglet Claude, panneau

**Session de barre latérale** :
Une session hébergée dans la vue `claudeVSCodeSidebar` plutôt que dans un onglet. N'est pas
un onglet et n'apparaît pas dans `tabGroups`.

**Session focalisée** :
La session correspondant à l'onglet de session actif de la fenêtre active. Notion
**par fenêtre** : chaque fenêtre a la sienne.

**Session indéterminée** :
L'état d'un onglet de session actif qu'on ne parvient pas à relier à une session — onglet
encore sans titre, ou titre partagé par plusieurs sessions. **N'est pas une erreur** :
c'est un état affichable, et il doit l'être. Un nom de pair affiché à tort conduit à
adresser la mauvaise session.
_Avoid_: erreur, inconnu, non trouvé
