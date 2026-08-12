# Restreindre les sessions candidates par `cwd`, affiner par `ppid` quand c'est gratuit

Avant de joindre sur le titre ([ADR-0001](./0001-jointure-par-ai-title.md)), il faut réduire
le registre aux sessions de **cette fenêtre**. Deux clés existent et **elles ne se
remplacent pas** : le `cwd` de la session comparé au dossier de travail de la fenêtre
(`realpath` + normalisation NFC, comme le fait l'extension Claude), portable partout ; et
la chaîne des processus parents remontant jusqu'au `process.pid` de l'hôte d'extensions,
exacte mais dont l'obtention n'est bon marché que sur macOS et Linux. Nous retenons le
`cwd` comme **socle** et le `ppid` comme **raffinement appliqué là où il est disponible**.

## Mécanique vérifiée

Mesurée en conditions réelles sur l'extension Claude **2.1.228**, macOS ([issue #1][spike]),
depuis l'hôte d'extensions lui-même — pas par lecture du binaire.

```text
claude (…/anthropic.claude-code-<version>-darwin-arm64/resources/native-binary/claude)
  ← Code Helper (Plugin)   ← process.pid de l'hôte d'extensions
  ← Code
```

**Un seul niveau.** Le processus `claude` est enfant direct de l'hôte d'extensions. Sur les
16 sessions vivantes de la machine de test, réparties sur 9 fenêtres, le `ppid` a séparé les
fenêtres sans une seule erreur : les sessions de la fenêtre courante remontent à son
`process.pid`, celles des autres fenêtres n'y remontent jamais.

**Aucun shell intermédiaire n'a pu être provoqué** en 2.1.228 : ni le réglage
`claudeCode.useTerminal`, ni la commande `claude-vscode.terminal.open` n'insèrent de niveau
— le processus reste enfant direct de l'hôte, avec `entrypoint: "claude-vscode"`.
`claudeCode.claudeProcessWrapper` n'a pas été testé et reste la piste crédible pour ce cas.

## Consequences

- **Le `cwd` seul ne discrimine pas deux fenêtres ouvertes sur le même projet** — situation
  courante ici, et vérifiée : trois sessions du même dépôt partageaient un `cwd` identique
  et n'étaient séparables que par leur `ppid`. Supprimer l'un des deux n'est pas une
  simplification.
- **Remonter plusieurs niveaux reste la bonne implémentation**, malgré la mesure à un seul
  niveau. Le coût est nul et l'hypothèse d'un shell inséré par un `claudeProcessWrapper`
  n'est pas réfutée : elle n'a simplement pas pu être reproduite. Un parcours borné (une
  dizaine de niveaux) couvre le cas sans rien coûter.
- **Sur Windows, seul le `cwd` opère.** C'est un choix assumé : lancer un PowerShell à
  chaque changement d'onglet contredirait la décision de ne rien lire tant qu'aucun
  événement ne l'exige.
- **Le contrôle de vivacité doit vérifier l'identité du processus**, pas seulement son
  existence : un `pid` de session fantôme peut avoir été recyclé par un programme sans
  rapport. Le registre expose `procStart`, qui donne de quoi confirmer l'identité.
- **Les sessions fantômes sont plus rares qu'attendu** : une sortie propre (SIGTERM inclus)
  supprime bien l'entrée de registre. Le cas reste à traiter — il naît d'un crash, pas d'une
  fermeture — mais il ne constitue pas le régime nominal.

[spike]: https://github.com/Emerging-it-guillaume/Claude-Session-Beacon/issues/1#issuecomment-5267867370
