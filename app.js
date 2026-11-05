(() => {
  const config = window.CAMPUSCONNECT_SUPABASE || {};
  const configured = Boolean(config.url && config.anonKey && !config.anonKey.includes("PASTE_YOUR_"));
  const supabase = configured && window.supabase?.createClient
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
  const $ = (id) => document.getElementById(id);
  const state = { user: null, profile: null, events: [], registrations: new Set(), range: "all", page: "events", selectedEvent: null, authMode: "login" };
  const dialogs = [$("authDialog"), $("eventDialog"), $("detailDialog"), $("attendeesDialog"), $("passwordDialog")];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const initials = (name) => String(name || "Campus Connect").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
  const dateText = (value, options = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) => new Date(value).toLocaleDateString(undefined, options);
  const timeText = (value) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const eventIsFuture = (event) => new Date(event.starts_at) > new Date();

  function setMessage(message = "", tone = "") {
    const node = $("statusMessage");
    node.textContent = message;
    node.dataset.tone = tone;
  }
  function toast(message) {
    const node = $("toast"); node.textContent = message; node.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2800);
  }
  function showConfigState() {
    document.body.dataset.config = configured ? "ready" : "missing";
    if (!configured) setMessage("Connect your Supabase anon key in supabase-config.js to load live events and enable accounts.");
  }
  function updateAccount() {
    const signedIn = Boolean(state.user);
    $("accountActions").hidden = signedIn;
    $("userChip").hidden = !signedIn;
    $("userName").textContent = state.profile?.full_name || state.user?.email?.split("@")[0] || "Account";
    $("avatar").textContent = initials(state.profile?.full_name || state.user?.email);
    $("profileName").textContent = state.profile?.full_name || "CampusConnect member";
    $("profileEmail").textContent = state.user?.email || "";
    $("profileAvatar").textContent = initials(state.profile?.full_name || state.user?.email);
    $("profileRole").textContent = state.profile?.role || "student";
    $("profileNameInput").value = state.profile?.full_name || "";
    document.querySelectorAll(".requires-auth").forEach((node) => node.hidden = !signedIn);
    document.querySelectorAll(".organizer-only").forEach((node) => node.hidden = state.profile?.role !== "organizer");
    $("createEventShortcut").hidden = state.profile?.role !== "organizer";
    $("hero").hidden = signedIn;
  }
  function toCard(event, registered = false, count = 0) {
    const spots = Math.max(0, Number(event.capacity) - count);
    const closed = !eventIsFuture(event);
    const canRegister = !closed && !registered && spots > 0;
    return `<article class="event-card"><div class="event-art" data-tone="${(String(event.id).charCodeAt(0) || 0) % 6}"><span class="art-symbol" aria-hidden="true">✦</span><span class="category-pill">${esc(event.category || "Campus event")}</span></div><div class="event-card-body"><h3>${esc(event.title)}</h3><div class="event-meta"><span aria-hidden="true">▦</span>${esc(dateText(event.starts_at))} · ${esc(timeText(event.starts_at))}</div><div class="event-meta"><span aria-hidden="true">⌖</span>${esc(event.location)}</div><div class="event-foot"><span class="spots"><b>${count} registered</b> · ${spots} spots</span><button class="small-button" data-action="details" data-id="${esc(event.id)}">${registered ? "View details" : canRegister ? "View details" : "Event details"}</button></div></div></article>`;
  }
  function emptyState(title, message) {
    return `<div class="empty-state"><div class="empty-icon">✦</div><b>${esc(title)}</b><span>${esc(message)}</span></div>`;
  }
  function getCounts() { return state.counts || {}; }
  function filteredEvents(events) {
    const query = $("searchInput").value.trim().toLocaleLowerCase();
    const category = $("categoryFilter").value;
    const weekFrom = new Date(); weekFrom.setHours(0, 0, 0, 0);
    const weekTo = new Date(weekFrom); weekTo.setDate(weekTo.getDate() + 7);
    return events.filter((event) => {
      const matchesQuery = !query || `${event.title} ${event.description} ${event.category} ${event.location}`.toLocaleLowerCase().includes(query);
      const matchesCategory = !category || event.category === category;
      const starts = new Date(event.starts_at);
      const matchesRange = state.range !== "week" || (starts >= weekFrom && starts < weekTo);
      return matchesQuery && matchesCategory && matchesRange;
    });
  }
  function renderEvents() {
    const upcoming = state.events.filter(eventIsFuture);
    const events = filteredEvents(upcoming);
    const categories = [...new Set(state.events.map((event) => event.category).filter(Boolean))].sort();
    const currentCategory = $("categoryFilter").value;
    $("categoryFilter").innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}`;
    $("categoryFilter").value = categories.includes(currentCategory) ? currentCategory : "";
    $("heroEventCount").textContent = `${upcoming.length} upcoming event${upcoming.length === 1 ? "" : "s"}`;
    if (state.page === "events") {
      $("eventGrid").innerHTML = events.length ? events.map((event) => toCard(event, state.registrations.has(event.id), getCounts()[event.id] || 0)).join("") : emptyState("No events found", state.events.length ? "Try a different search, date, or category." : "Be the first to bring your campus community together.");
    }
  }
  function renderRegistrations() {
    const items = state.events.filter((event) => state.registrations.has(event.id));
    $("registrationGrid").innerHTML = items.length ? items.map((event) => toCard(event, true, getCounts()[event.id] || 0)).join("") : emptyState("No registrations yet", "Explore events and save a place for something fun.");
  }
  function renderOrganizerEvents() {
    const events = state.events.filter((event) => event.organizer_id === state.user?.id);
    $("organizerEvents").innerHTML = events.length ? events.map((event) => `<article class="manage-row"><div class="manage-art" aria-hidden="true">✦</div><div class="manage-info"><b>${esc(event.title)}</b><small>${esc(dateText(event.starts_at))} · ${esc(event.location)} · ${getCounts()[event.id] || 0}/${event.capacity} registered</small></div><div class="manage-actions"><button class="small-button" data-action="attendees" data-id="${esc(event.id)}">View attendees</button><button class="small-button" data-action="edit" data-id="${esc(event.id)}">Edit</button></div></article>`).join("") : emptyState("No events yet", "Create your first event to bring people together.");
  }
  function render() {
    updateAccount(); renderEvents(); renderRegistrations(); renderOrganizerEvents();
    document.querySelectorAll(".nav-link").forEach((node) => node.classList.toggle("active", node.dataset.page === state.page));
    $("hero").hidden = Boolean(state.user) || state.page !== "events";
    $("events").hidden = state.page !== "events";
    $("organizerSection").hidden = state.page !== "organizer";
    $("registrationsSection").hidden = state.page !== "registrations";
    $("profileSection").hidden = state.page !== "profile";
  }
  async function loadData() {
    if (!supabase) { render(); return; }
    setMessage("Loading campus events…");
    try {
      const { data: events, error } = await supabase.from("events").select("*").order("starts_at", { ascending: true });
      if (error) throw error;
      state.events = events || [];
      const { data: counts, error: countError } = await supabase.rpc("public_event_counts");
      state.counts = {};
      if (!countError) (counts || []).forEach((row) => state.counts[row.event_id] = Number(row.registration_count || 0));
      if (state.user) {
        const { data: rows, error: registrationsError } = await supabase.from("registrations").select("event_id").eq("student_id", state.user.id);
        if (!registrationsError) state.registrations = new Set((rows || []).map((row) => row.event_id));
      }
      setMessage(state.events.length ? `${state.events.filter(eventIsFuture).length} upcoming events on your campus.` : "There are no events yet. Organizers can create the first one.");
    } catch (error) {
      setMessage(error.message || "Could not load events. Check your Supabase setup.", "error");
    }
    render();
  }
  async function loadProfile(user) {
    if (!user) { state.user = null; state.profile = null; state.registrations.clear(); render(); return; }
    state.user = user;
    const { data, error } = await supabase.from("profiles").select("id, full_name, role").eq("id", user.id).maybeSingle();
    state.profile = !error && data ? data : { id: user.id, full_name: user.user_metadata?.full_name || "", role: user.user_metadata?.role || "student" };
    render();
  }
  function openAuth(mode = "login") {
    if (!supabase) { toast("Add your Supabase anon key in supabase-config.js first."); return; }
    state.authMode = mode;
    const signup = mode === "signup";
    $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("authSubtitle").textContent = signup ? "Join your campus community in a few steps." : "Log in and see what’s happening on campus.";
    $("authSubmit").textContent = signup ? "Create account" : "Log in";
    $("nameField").hidden = !signup; $("roleField").hidden = !signup;
    $("fullName").required = signup; $("authMessage").textContent = "";
    $("authSwitch").innerHTML = signup ? 'Already have an account? <button type="button" data-auth="login">Log in</button>' : 'New to CampusConnect? <button type="button" data-auth="signup">Create an account</button>';
    $("authDialog").showModal();
  }
  async function handleAuth(event) {
    event.preventDefault();
    const message = $("authMessage"); message.textContent = "";
    const email = $("email").value.trim(); const password = $("password").value;
    $("authSubmit").disabled = true;
    try {
      if (state.authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: $("fullName").value.trim(), role: $("role").value } } });
        if (error) throw error;
        if (!data.session) { $("authDialog").close(); toast("Check your email to confirm your account, then log in."); }
        else { $("authDialog").close(); await loadProfile(data.user); await loadData(); toast("Welcome to CampusConnect!"); }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        $("authDialog").close(); await loadProfile(data.user); await loadData(); toast("You’re logged in.");
      }
    } catch (error) { message.textContent = error.message || "Could not complete sign in."; }
    finally { $("authSubmit").disabled = false; }
  }
  function openEvent(event = null) {
    if (!state.user || state.profile?.role !== "organizer") { toast("Log in with an organizer account to manage events."); return; }
    $("eventForm").reset(); $("eventMessage").textContent = ""; $("eventCapacity").value = "50";
    $("editEventId").value = event?.id || "";
    $("eventFormTitle").textContent = event ? "Edit event" : "Create an event";
    $("eventSubmit").textContent = event ? "Save changes" : "Publish event";
    if (event) {
      $("eventTitle").value = event.title; $("eventDescription").value = event.description;
      $("eventCategory").value = event.category; $("eventLocation").value = event.location;
      $("eventCapacity").value = event.capacity;
      $("eventStarts").value = new Date(new Date(event.starts_at).getTime() - new Date(event.starts_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      $("eventEnds").value = new Date(new Date(event.ends_at).getTime() - new Date(event.ends_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    $("eventDialog").showModal();
  }
  async function handleEventSave(event) {
    event.preventDefault(); const message = $("eventMessage"); message.textContent = "";
    const starts = new Date($("eventStarts").value); const ends = new Date($("eventEnds").value);
    if (ends <= starts) { message.textContent = "The end time must be after the start time."; return; }
    const values = { title: $("eventTitle").value.trim(), description: $("eventDescription").value.trim(), category: $("eventCategory").value.trim(), starts_at: starts.toISOString(), ends_at: ends.toISOString(), location: $("eventLocation").value.trim(), capacity: Number($("eventCapacity").value) };
    const id = $("editEventId").value; $("eventSubmit").disabled = true;
    try {
      const query = id ? supabase.from("events").update(values).eq("id", id).eq("organizer_id", state.user.id) : supabase.from("events").insert({ ...values, organizer_id: state.user.id });
      const { error } = await query;
      if (error) throw error;
      $("eventDialog").close(); await loadData(); state.page = "organizer"; render(); toast(id ? "Event updated." : "Your event is live!");
    } catch (error) { message.textContent = error.message || "Could not save this event."; }
    finally { $("eventSubmit").disabled = false; }
  }
  function openDetails(event) {
    state.selectedEvent = event;
    $("detailCategory").textContent = event.category || "Campus event";
    $("detailTitle").textContent = event.title;
    $("detailDescription").textContent = event.description;
    $("detailMeta").innerHTML = `<div class="event-meta"><span aria-hidden="true">▦</span>${esc(dateText(event.starts_at))} · ${esc(timeText(event.starts_at))}–${esc(timeText(event.ends_at))}</div><div class="event-meta"><span aria-hidden="true">⌖</span>${esc(event.location)}</div><div class="event-meta"><span aria-hidden="true">♙</span>Hosted by ${esc(state.events.find((item) => item.id === event.id)?.organizer_name || "Campus organizer")}</div>`;
    const registered = state.registrations.has(event.id); const count = getCounts()[event.id] || 0; const spots = Math.max(0, Number(event.capacity) - count);
    $("detailCapacity").textContent = spots ? `${spots} of ${event.capacity} spots left` : "This event is full";
    $("registerButton").hidden = state.profile?.role === "organizer" || !eventIsFuture(event);
    $("registerButton").textContent = !state.user ? "Log in to register" : registered ? "You’re registered ✓" : spots ? "Register for event" : "Event full";
    $("registerButton").disabled = registered || spots === 0;
    $("detailDialog").showModal();
  }
  async function register() {
    const event = state.selectedEvent;
    if (!event || !state.user) { toast("Log in as a student to register for events."); return; }
    if (state.profile?.role !== "student") { toast("Only student accounts can register for events."); return; }
    const button = $("registerButton"); button.disabled = true;
    try {
      const { error } = await supabase.rpc("register_for_event", { target_event_id: event.id });
      if (error) throw error;
      state.registrations.add(event.id); state.counts[event.id] = (state.counts[event.id] || 0) + 1;
      $("detailDialog").close(); render(); toast(`You’re registered for ${event.title}!`);
    } catch (error) { toast(error.message || "Could not register for this event."); }
    finally { button.disabled = false; }
  }
  async function loadAttendees(event) {
    $("attendeesTitle").textContent = `Attendees — ${event.title}`;
    $("attendeeList").innerHTML = '<div class="attendee-empty">Loading attendee list…</div>';
    $("attendeesDialog").showModal();
    const { data, error } = await supabase.from("registrations").select("created_at, profiles(full_name, email)").eq("event_id", event.id).order("created_at", { ascending: true });
    if (error) { $("attendeeList").innerHTML = `<div class="attendee-empty">${esc(error.message)}</div>`; return; }
    $("attendeeList").innerHTML = data?.length ? `<div class="attendee-row header"><span>#</span><span>Name</span><span>Email</span><span>Registered</span></div>${data.map((row, index) => `<div class="attendee-row"><span>${index + 1}</span><span>${esc(row.profiles?.full_name || "Student")}</span><span>${esc(row.profiles?.email || "")}</span><span>${esc(dateText(row.created_at, { month: "short", day: "numeric" }))}</span></div>`).join("")}` : '<div class="attendee-empty">No students have registered yet.</div>';
  }
  function navigate(page) {
    if ((page === "registrations" || page === "organizer") && !state.user) { openAuth("login"); return; }
    if (page === "organizer" && state.profile?.role !== "organizer") { toast("Organizer accounts can manage events."); return; }
    state.page = page; render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("click", async (event) => {
    const auth = event.target.closest("[data-auth]");
    if (auth) { event.preventDefault(); openAuth(auth.dataset.auth); return; }
    const close = event.target.closest("[data-close]"); if (close) { close.closest("dialog")?.close(); return; }
    const nav = event.target.closest("[data-page]"); if (nav) { navigate(nav.dataset.page); return; }
    const action = event.target.closest("[data-action]"); if (!action) return;
    const item = state.events.find((row) => row.id === action.dataset.id); if (!item) return;
    if (action.dataset.action === "details") openDetails(item);
    if (action.dataset.action === "edit") openEvent(item);
    if (action.dataset.action === "attendees") await loadAttendees(item);
  });
  $("authForm").addEventListener("submit", handleAuth);
  $("eventForm").addEventListener("submit", handleEventSave);
  $("registerButton").addEventListener("click", register);
  $("searchInput").addEventListener("input", renderEvents);
  $("categoryFilter").addEventListener("change", renderEvents);
  document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
    state.range = button.dataset.range;
    document.querySelectorAll("[data-range]").forEach((node) => node.classList.toggle("active", node === button));
    renderEvents();
  }));
  $("createEventShortcut").addEventListener("click", () => openEvent());
  $("newEventButton").addEventListener("click", () => openEvent());
  $("userChip").addEventListener("click", () => navigate("profile"));
  $("logoutButton").addEventListener("click", async () => {
    await supabase.auth.signOut(); state.profile = null; state.user = null; state.registrations.clear(); state.page = "events"; await loadData(); toast("You’re logged out.");
  });
  $("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault(); $("profileMessage").textContent = "";
    const full_name = $("profileNameInput").value.trim();
    const { error } = await supabase.from("profiles").update({ full_name }).eq("id", state.user.id);
    if (error) { $("profileMessage").textContent = error.message; return; }
    state.profile.full_name = full_name; updateAccount(); toast("Profile updated.");
  });
  $("changePasswordButton").addEventListener("click", () => { $("passwordMessage").textContent = ""; $("newPassword").value = ""; $("passwordDialog").showModal(); });
  $("passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault(); $("passwordSubmit").disabled = true;
    const { error } = await supabase.auth.updateUser({ password: $("newPassword").value });
    $("passwordSubmit").disabled = false;
    if (error) { $("passwordMessage").textContent = error.message; return; }
    $("passwordDialog").close(); toast("Password updated.");
  });
  dialogs.forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));

  (async () => {
    showConfigState();
    if (!supabase) { render(); return; }
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) await loadProfile(data.session.user);
    await loadData();
    supabase.auth.onAuthStateChange((_event, session) => { void loadProfile(session?.user || null).then(loadData); });
  })();
})();
