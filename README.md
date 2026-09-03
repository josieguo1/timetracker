# TIME TRACKER

A self-contained time tracking web app — no build step, no dependencies.
All data is stored in your browser's `localStorage`.

## Run it

From this folder:

```bash
python3 -m http.server 5273
```

then open http://localhost:5273. (Opening `index.html` directly also works
in most browsers, but a local server is the reliable way — and note that
tracked data is tied to how you open it, so pick one and stick with it.)

## Tabs

- **Timer** — pick a project, Start/Stop. Entries are listed day by day with
  daily totals; each entry can have its date and times edited (✎) or be
  deleted (✕). Times stay within the entry's day — an entry whose end is not
  after its start is rejected with an "Invalid entry" message. A running
  timer survives page reloads and shows in the browser tab title.
- **Projects** — add projects with a colour (24 preset colours — the first
  eight chosen to stay distinguishable in charts — or any custom colour from
  the toggleable colour grid). Presets are editable: hover one and click ×
  to remove it, or save the current colour as a preset with "+ Add Preset".
  Projects can have subprojects ("+ Sub" on a project row); archiving or
  deleting a project cascades to its subprojects. Archived projects can be
  deleted along with their entries.
- **Reports** — stacked bar chart of tracked time by project.
  - Range: Week / Month / Year, with ‹ › to step through past periods.
  - Grouping: By Project (subproject time rolls up into its parent) or
    By Subproject (each stands alone with its own colour).
  - Bar size: per day, week, or month (options adapt to the range).
  - "Set as default view" saves the current range + bar size as what the
    Reports tab opens with.
  - Hover any bar for a per-project breakdown. Below the chart, a donut
    chart shows each project's share with the period total in the centre;
    click a slice to highlight that project in the list beneath.

- **Settings** — Report Export (the Reports tab's current view
  as an .xlsx with the time table and native Excel charts, or as a PDF of
  the report cards); Backup &amp; Export: download/restore a JSON backup of
  all data (keep the file in iCloud Drive or Google Drive for a cloud
  copy), and export every entry to an Excel (.xlsx) worksheet.

Entry times are edited with a scrollable hour/minute picker.
Light and dark mode follow the system setting.
