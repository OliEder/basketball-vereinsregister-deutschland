# Saison-Archiv

Tabellen und Ergebnisse aller Ligen, je Saison dauerhaft gesichert (Quelle: BBB-API, Projekt basketball-vereinsregister-deutschland).
Die API liefert nur die laufende Saison; dieser Branch bewahrt den Stand früherer Saisons.

- `<saison>/index.json`: Übersicht der Ligen (Name, Verband, Ebene, Bezirk, Kreis, Anzahl Teams/Spiele, Prüfsumme)
- `<saison>/liga/<ligaId>.json.gz`: Liga mit `tabelle` und `matches` (gzip, JSON)

Der Branch wird einmal täglich durch genau einen Commit ersetzt. Ein Eintrag wird nie durch einen Stand mit weniger
gespielten Spielen ersetzt und nie gelöscht. Es werden keine Spielerdaten gespeichert.
