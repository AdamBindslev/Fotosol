# FotoSol – af Fotografiske Signaler ☀️📸✨

En lynhurtig, specialiseret **Progressive Web App (PWA)** skabt til fotografer, der ønsker præcis kontrol over **solens placering (azimut)**, **solens højde (elevation)** og en **interaktiv grafisk simulering af skyggens længde og retning** i forhold til lokation og tid på dagen.

Bygget i den velkendte **Kamera-EVF (Elektronisk Søger) æstetik** med Fotografiske Signaler-branding, 100% offline-kompatible trigonometriske beregninger og realtids-skyggevisualisering.

---

## 🌟 Nøglefunktioner for fotografer

1. **📐 Dynamisk Grafisk Skyggesimulering**:
   - **3D EVF-Søger**: Interaktiv 3D-scene hvor du kan rotere kameravinklen for at se scenen i perspektiv, direkte mod solen (modlysvinkel) eller i skyggens retning (medlys).
   - **Tydelig, kontrastrig skygge**: Markant og solid skyggeprojektion på en oplyst terrænflade med afstandsmarkeringer og telemetri-badge ved skyggespidsen.
   - **2D Kompas & Solur (Radar)**: Top-down visning af solens bane hen over kompasset, solvektor og skyggekegle modsat solen.

2. **🗺️ Interaktivt Fotokort (Leaflet Satellit & Gadekort)**:
   - Skift til **KORT**-fanen for at se solens vinkel og skyggens faktiske fald over det virkelige terræn!
   - Inkluderer fotografernes foretrukne satellitkort (luftfoto) samt mørkt EVF-kort.
   - Træk eller klik på kortet for at flytte kameraet og planlægge billeder ved kirker, klipper, bygninger eller kyster.
   - Dynamisk solvektor (gylden stråle), skyggekegle (i meter) og solopgangs-/solnedgangslinjer direkte på kortet.

2. **⏱️ Døgn-tidsrejse & Afspilning ("Kør tiden frem")**:
   - **Tidslinje-scrubber**: 24-timers slider med farvekodet forløb gennem nattens mørke, den blå time, solopgang, den gyldne time og middagssolen.
   - **Afspilningsanimation (Play/Pause)**: Tryk på ▶️ for at køre tiden jævnt frem (1×, 5×, 10×, 30×, 60× hastighed) og se skyggen rotere og vokse/krympe som et levende solur.
   - **🔴 LIVE NU**: Synkroniserer øjeblikkeligt med det aktuelle minut på uret.
   - **Hurtighop-knapper**: Ét klik for at springe direkte til solopgang, morgenens gyldne time, solmiddag (korteste skygge), aftenens gyldne time, solnedgang eller den blå time.

3. **📍 GPS & Avanceret Stedsøgning**:
   - EVF-topbar med ét-tryks GPS-opdatering i felten.
   - Fritekstsøgning via Open-Meteo Geocoding.
   - Indbygget katalog over populære danske fotospots (f.eks. *Møns Klint*, *Rubjerg Knude*, *Grenen*, *Silkeborg Søerne*, *Dyrehaven*, *Bornholm*, m.fl.).

4. **🚶 Motiv- & Højdevalg**:
   - Skift motivtype og højde med det samme:
     - 📷 **Fotograf med kamerastativ** (1.80 m)
     - 🚶 **Voksen person** (1.75 m)
     - 🌳 **Solitært træ** (5.0 m)
     - 🏢 **Bygning / Mur** (10.0 m)
     - ⚙️ **Fri højde-slider** (fra 0.5 m til 25 m)
   - Real-time telemetri: Skyggelængde i meter, skyggefaktor ($\times H$) og kompasretning.

5. **🌤️ Skydække & Skyggekvalitet**:
   - Forbindes med Open-Meteo for at vurdere skyggens hårdhed baseret på reelt lokalt skydække:
     - **Knivskarp**: 0–20% skyer (hårde, kontrastrige skygger).
     - **Moderat**: 21–65% skyer (filtreret sollys med bløde overgange).
     - **Diffus**: 66–85% skyer (svage konturer).
     - **Overskyet**: > 85% skyer (spredt himmellys uden direkte skygge).

6. **☀️ 100% Fokus på Solen & Dagslyset**:
   - Fokuseret udelukkende på solens bane, gyldne/blå timer, solmiddag og skyggelængder.

7. **📱 Fuld PWA & 100% Offline Support**:
   - Installeres direkte på mobilen som en native app.
   - Service Worker (`sw.js`) cacher appen så alle sol- og skyggeberegninger fungerer uden mobildækning i naturen.

---

## 📲 Sådan installeres appen på mobilen (PWA)

### iPhone / iPad (Safari)
1. Åbn `FotoSol` i **Safari**.
2. Tryk på **Del-knappen** (firkanten med pil op).
3. Rul ned og vælg **"Føj til hjemmeskærm"**.
4. Appen installeres som et app-ikon og åbner i fuld skærm.

### Android (Chrome)
1. Åbn `FotoSol` i **Chrome**.
2. Tryk på de **3 prikker** øverst til højre.
3. Vælg **"Føj til startskærm"** eller **"Installer app"**.

---

## 📸 Fotografisk Formelgrundlag

Skyggelængden $L$ beregnes ud fra motivets højde $H$ og solens højdevinkel over horisonten $\theta$:

$$L = \frac{H}{\tan(\theta)}$$

Skyggens kompasretning er altid diametralt modsat solens azimut:

$$\text{Skygge-azimut} = (\text{Solens azimut} + 180^\circ) \bmod 360^\circ$$

Når $\theta \le 0^\circ$ (solen under horisonten), ophører den direkte geometriske skygge, og appen skifter automatisk til tusmørke- og langtidseksponeringstelemetri.

---

Skabt til fotografer af **Adam Bindslev – Fotografiske Signaler**.
Besøg [adambindslev.dk](https://adambindslev.dk) for flere værktøjer og podcasten *Fotografiske Signaler*.
