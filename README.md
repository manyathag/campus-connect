# CampusConnect

CampusConnect helps students discover campus events and manage their registrations. Organizers can publish events, update them, and see attendee lists.

## Connect the Supabase project

The frontend uses Supabase Auth and the Supabase JavaScript client. The project URL is already set to `https://kwebtrgmytqwdkcgshij.supabase.co`.

1. In the Supabase dashboard, open **Project Settings → API** and copy the **anon/public** key.
2. Paste that value into `anonKey` in [`supabase-config.js`](supabase-config.js).
3. Open the Supabase SQL Editor for this project and run [`supabase/schema.sql`](supabase/schema.sql). It creates profiles, events, registrations, access policies, and the registration RPC.
4. In **Authentication → URL Configuration**, add your local or deployed site URL to the allowed redirect URLs.
5. Serve the project from a local web server or static host. For example, run `python3 -m http.server 8000` in this folder and open `http://localhost:8000`.

Use only the Supabase anon/public key in the browser. Never put a `service_role` or secret key in `supabase-config.js` or commit it to Git.

## Features

- Public event discovery with search, category, and upcoming-week filters
- Email and password sign-up and login
- Student registrations, capacity checks, and a personal registration list
- Organizer event creation and editing
- Organizer attendee lists
- Responsive layout based on the supplied CampusConnect wireframe

Students and organizers choose an account type at sign-up. If Supabase email confirmation is enabled, new users need to confirm their address before they can log in.

## Files

- `index.html`, `styles.css`, `profile.css`, `app.js`: responsive CampusConnect web app
- `supabase-config.js`: public Supabase project configuration
- `supabase/schema.sql`: database tables, Row Level Security, and registration function
