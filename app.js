(() => {
  const SUPABASE_URL = "https://dgudohauvnnlzeynfskt.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndWRvaGF1dm5ubHpleW5mc2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NzYyMjksImV4cCI6MjA3ODU1MjIyOX0.1QcfLcJX9jpJBq7n4RaivqwbCm53IBKD_U-2CfTIaMw";
  const TABLE = "rues";
  // =============================================

  const STATUS_COLORS = {
    "À faire": "#ef4444",
    "En cours": "#eab308",
    Fait: "#22c55e",
  };

  let streetLayer, sb;
  let featuresIndex = {}; // key(normalisée) -> {layer, feature, name}
  let statusIndex = {}; // "NomRue" -> {statut,benevole,date,remarques}

   --- Utils ---

  function normName(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // enlève accents
      .toLowerCase()
      .trim();
  }

  function getStatus(name) {
    return (
      statusIndex[name] || {
        statut: "À faire",
        benevole: "",
        date: "",
        remarques: "",
      }
    );
  }

  // Style en fonction du statut
  function styleForFeature(feat) {
    const name = feat.properties?.name ?? "Sans nom";
    const rec = statusIndex[name];
    const statut = rec ? rec.statut : "À faire";
    const color = STATUS_COLORS[statut] || "#ef4444";
    return { color, weight: 4, opacity: 0.8 };
  }

  function refreshStyles() {
    if (streetLayer && typeof streetLayer.setStyle === "function") {
      streetLayer.setStyle(styleForFeature);
    }
  }

  function resetStreetList() {
    const listSelect = document.getElementById("rue");
    if (!listSelect) return;

    const currentValue = listSelect.value;
    const names = Object.values(featuresIndex)
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    listSelect.innerHTML = names
      .map((n) => `<option value="${n}">${n}</option>`)
      .join("");

    if (names.includes(currentValue)) {
      listSelect.value = currentValue;
    } else if (names.length) {
      listSelect.value = names[0];
    }
  }

  // --- Carte ---

  const map = L.map("map").setView([45.7615, 4.773], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  console.log("🟢 Script chargé correctement !");

  async function loadRoads() {
    const r = await fetch("./roads.geojson");
    if (!r.ok) {
      alert("⚠️ Fichier roads.geojson introuvable !");
      throw new Error("roads.geojson introuvable");
    }

    const gj = await r.json();
    if (!gj.features || gj.features.length === 0) {
      alert("⚠️ Le fichier ne contient aucune 'feature'. Vérifie l'export Overpass !");
      throw new Error("pas de features");
    }

    console.log("✅ GeoJSON chargé :", gj.features.length, "features");

    // on vide les anciens index
    featuresIndex = {};

    streetLayer = L.geoJSON(gj, {
      style: styleForFeature,
      onEachFeature: function (feature, layer) {
        const name =
          feature.properties && feature.properties.name
            ? feature.properties.name
            : null;
        if (!name) return;
        const key = normName(name);
        featuresIndex[key] = { layer, feature, name };
        layer.on("click", function () {
          focusOn(name);
          showPopup(name);
        });
      },
    }).addTo(map);

    resetStreetList();

    console.log("✅ Rues affichées :", Object.keys(featuresIndex).length);
  }

  function focusOn(name) {
    const entry = featuresIndex[normName(name)];
    if (!entry) return;
    const b = entry.layer.getBounds?.();
    if (b) map.fitBounds(b, { maxZoom: 18 });

    const s = getStatus(name);
    document.getElementById("rue").value = name;
    document.getElementById("statut").value = s.statut || "À faire";
    document.getElementById("benevole").value = s.benevole || "";
    document.getElementById("date").value = s.date || "";
    document.getElementById("remarques").value = s.remarques || "";
    updateStatusButtons(document.getElementById("statut").value);
  }

  function showPopup(name) {
    const entry = featuresIndex[normName(name)];
    if (!entry) return;
    const s = getStatus(name);

    entry.layer
      .bindPopup(
        `<strong>${name}</strong><br>
         Statut: ${s.statut || "À faire"}<br>
         Bénévole: ${s.benevole || ""}<br>
         Date: ${s.date || ""}<br>
         Remarques: ${s.remarques || ""}`
      )
      .openPopup();
  }

  // --- Supabase (sans SQL) ---

  function initSupabase() {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  async function loadStatuses() {
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) {
      console.error(error);
      return;
    }
    statusIndex = {};
    for (const row of data) {
      statusIndex[row.name] = {
        statut: row.statut || "À faire",
        benevole: row.benevole || "",
        date: row.date || "",
        remarques: row.remarques || "",
      };
    }
    refreshStyles();
  }

  async function saveStatus(name, statut, benevole, date, remarques) {
    const { error } = await sb
      .from(TABLE)
      .upsert([{ name, statut, benevole, date, remarques }], {
        onConflict: "name",
      });
    if (error) throw error;
    statusIndex[name] = { statut, benevole, date, remarques };
    refreshStyles();
  }

  // --- UI : recherche ---

  (function setupSearch() {
    const searchInput = document.getElementById("search");
    const searchBtn = document.getElementById("btnSearch");
    const listSelect = document.getElementById("rue");
    const msg = document.getElementById("msg");

    if (!searchInput || !searchBtn || !listSelect) return;

    function doSearch() {
      const q = normName(searchInput.value);
      if (!q) {
        if (msg) msg.textContent = "Tape un nom de rue.";
        return;
      }

      const hits = Object.keys(featuresIndex).filter((k) => k.includes(q));
      if (hits.length === 0) {
        if (msg) msg.textContent = "Aucun résultat.";
        return;
      }

      const names = [...new Set(
        hits.map((k) => {
          const e = featuresIndex[k];
          return e?.name || e?.feature?.properties?.name || "";
        })
      )].sort((a, b) => a.localeCompare(b));

      const firstName = names[0];

      // met à jour la liste
      listSelect.innerHTML = names
        .map((n) => `<option value="${n}">${n}</option>`)
        .join("");
      listSelect.value = firstName;

      // centre la carte
      focusOn(firstName);
      showPopup(firstName);

      if (msg) msg.textContent = `✔ ${names.length} résultat(s)`;
    }

    searchBtn.onclick = doSearch;

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });

    // Quand on efface la recherche -> on remet la liste complète
    searchInput.addEventListener("input", () => {
      if (!searchInput.value.trim()) {
        resetStreetList();
        if (msg) msg.textContent = "Liste complète.";
      }
    });
  })();

  // --- UI : select rue ---

  document.getElementById("rue").addEventListener("change", (e) => {
    focusOn(e.target.value);
  });

  // === Boutons "À faire / En cours / Fait" ===

  const btnAF = document.getElementById("btnAF");
  const btnEC = document.getElementById("btnEC");
  const btnF = document.getElementById("btnF");
  const selectStatut = document.getElementById("statut");

  function updateStatusButtons(active) {
    // tout le monde en "ghost"
    btnAF.className = "btn ghost";
    btnEC.className = "btn ghost";
    btnF.className = "btn ghost";

    // on met en bleu le bon
    if (active === "À faire") btnAF.className = "btn";
    else if (active === "En cours") btnEC.className = "btn";
    else btnF.className = "btn";
  }

  function setStatus(statut) {
    selectStatut.value = statut;
    updateStatusButtons(statut);
  }

  btnAF.addEventListener("click", () => setStatus("À faire"));
  btnEC.addEventListener("click", () => setStatus("En cours"));
  btnF.addEventListener("click", () => setStatus("Fait"));

  // --- Bouton Valider ---

  document.getElementById("btnSave").addEventListener("click", async () => {
    const name = document.getElementById("rue").value;
    const statut = document.getElementById("statut").value;
    const benevole = document.getElementById("benevole").value;
    const date = document.getElementById("date").value;
    const remarques = document.getElementById("remarques").value;
    const msg = document.getElementById("msg");
    msg.textContent = "Enregistrement…";
    try {
      await saveStatus(name, statut, benevole, date, remarques);
      msg.textContent = "✅ Sauvegardé.";
    } catch (e) {
      console.error(e);
      msg.textContent = "⚠️ Erreur (policies/clé ?)";
    }
  });

  // --- Init globale ---

  (async function () {
    initSupabase();
    await loadStatuses();
    await loadRoads();
    document.getElementById("msg").textContent = "Prêt.";
  })();

  // ================== PWA INSTALL BUTTON ==================
  let deferredPrompt = null;

  // Le navigateur signale que l'app est installable
  window.addEventListener("beforeinstallprompt", (event) => {
    // On empêche le popup natif
    event.preventDefault();
    deferredPrompt = event;

    const btn = document.getElementById("pwaInstallBtn");
    if (btn) {
      btn.classList.remove("hidden");
    }
  });

  // Quand l'utilisateur clique sur le bouton
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("pwaInstallBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!deferredPrompt) {
        // Rien à proposer (déjà installée ou non compatible)
        btn.classList.add("hidden");
        return;
      }

      // Ouvre la boîte de dialogue d'installation
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log("Résultat installation PWA :", outcome);

      // On nettoie et on cache le bouton
      deferredPrompt = null;
      btn.classList.add("hidden");
    });
  });
})();
