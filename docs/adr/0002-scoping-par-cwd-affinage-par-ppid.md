# Restreindre les sessions candidates par `cwd`, affiner par `ppid` quand c'est gratuit

Avant de joindre sur le titre ([ADR-0001](./0001-jointure-par-ai-title.md)), il faut réduire
le registre aux sessions de **cette fenêtre**. Deux clés existent et **elles ne se
remplacent pas** : le `cwd` de la session comparé au dossier de travail de la fenêtre
(`realpath` + normalisation NFC, comme le fait l'extension Claude), portable partout ; et
la chaîne des processus parents remontant jusqu'au `process.pid` de l'hôte d'extensions,
exacte mais dont l'obtention n'est bon marché que sur macOS et Linux. Nous retenons le
`cwd` comme **socle** et le `ppid` comme **raffinement appliqué là où il est disponible**.

## Consequences

- **Le `cwd` seul ne discrimine pas deux fenêtres ouvertes sur le même projet** — situation
  courante ici. Dans ce cas la jointure par titre fait le travail, et le `ppid` la sécurise
  là où il est disponible. Supprimer l'un des deux n'est donc pas une simplification.
- **Le `ppid` immédiat ne suffit pas** : le réglage `useTerminal` ou un
  `claudeProcessWrapper` insère un shell entre l'hôte d'extensions et le binaire. Il faut
  remonter plusieurs niveaux de parenté.
- **Sur Windows, seul le `cwd` opère.** C'est un choix assumé : lancer un PowerShell à
  chaque changement d'onglet contredirait la décision de ne rien lire tant qu'aucun
  événement ne l'exige.
- **Le contrôle de vivacité doit vérifier l'identité du processus**, pas seulement son
  existence : un `pid` de session fantôme peut avoir été recyclé par un programme sans
  rapport.
