# Roster and photo import

Add local content under `content/`. The entire directory is ignored by Git.

```text
content/
├── roster/
│   └── roster.csv
├── photos/
│   └── originals/
│       ├── 1 - Montoya1.jpg
│       └── ...
└── site/
    ├── banner.jpg
    └── logo.png     (optional)
```

Use these exact CSV headers: `jersey_number,first_name,last_name`. Jersey numbers can repeat; every player receives a permanent internal ID. A blank jersey number is allowed. The admin page previews the CSV rows and imports them together. Import appends players to the current roster, so use it once for the initial roster and then use the admin form to add individual players.

Keep all 219 original JPEG filenames unchanged. The matcher reads filenames in the form `<jersey number> - <name><sequence>.jpg`, such as `1 - Montoya1.jpg` or `14 - Carson Griffin142.jpg`. It matches jersey plus either surname or first-and-last name. If a match is ambiguous or missing, choose the player manually in the upload review list. The sequence suffix is not used as a player ID.

Select all original JPEGs in the admin photo uploader. The browser computes each source hash, creates a display JPEG for browsing, and leaves each source file untouched. Review every assignment. For each duplicate, explicitly choose **Keep as separate photo** or **Skip this photo**. Keep the source files until the admin reports every intended upload as published.

The banner and optional logo can also be added later in **Admin → Website artwork**. Uploads are stored in the private R2 bucket; the public site serves images through the Worker.
