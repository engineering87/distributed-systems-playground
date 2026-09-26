/* Distributed Systems Playground — interface translations.
   The interface is written in English. When another language is chosen, a MutationObserver translates text
   nodes and a few attributes as they appear, using exact phrases and patterns. Code, checker diagnostics and
   the documentation are not translated. */
(function (root) {
'use strict';

const IT = {};
const PAT = [];
const BLOCKS = {};
const M = (en, it) => { IT[en] = it; };
const P = (re, fn) => PAT.push([re, fn]);

// ---------------------------------------------------------------- exact phrases
[
  ['Distributed Systems Playground', 'Distributed Systems Playground'],
  ['Example', 'Esempio'], ['Choose…', 'Scegli…'], ['Seed', 'Seme'], ['Random seed', 'Seme casuale'],
  ['Run', 'Esegui'], ['Run (Ctrl+Enter)', 'Esegui (Ctrl+Invio)'], ['Export', 'Esporta'], ['Import', 'Importa'],
  ['Gallery', 'Galleria'], ['Browse the examples', 'Sfoglia gli esempi'], ['Settings', 'Impostazioni'],
  ['Keyboard shortcuts', 'Scorciatoie da tastiera'], ['Keyboard shortcuts (?)', 'Scorciatoie da tastiera (?)'],
  ['Topology', 'Topologia'], ['Tool', 'Strumento'], ['Select', 'Seleziona'], ['Node', 'Nodo'], ['Link', 'Collegamento'],
  ['Delete', 'Elimina'], ['Select and move (V)', 'Seleziona e sposta (V)'], ['Add a process (N)', 'Aggiungi un processo (N)'],
  ['Connect two processes (L)', 'Collega due processi (L)'], ['Delete (D)', 'Elimina (D)'], ['Directed', 'Orientato'],
  ['Topology generator', 'Generatore di topologia'], ['Ring', 'Anello'], ['Complete', 'Completo'], ['Star', 'Stella'],
  ['Grid', 'Griglia'], ['Line', 'Linea'], ['Random', 'Casuale'], ['Binary tree', 'Albero binario'],
  ['Number of processes', 'Numero di processi'], ['Number of processes (2 to 40)', 'Numero di processi (da 2 a 40)'],
  ['Generate', 'Genera'], ['Fit', 'Adatta'], ['Fit to view', 'Adatta alla vista'], ['Labels', 'Etichette'],
  ['Show the message type on packets in flight', 'Mostra il tipo dei messaggi sui pacchetti in viaggio'],
  ['Layers', 'Livelli'], ['Color messages by the module that originated them', 'Colora i messaggi in base al modulo che li ha originati'],
  ['Process graph', 'Grafo dei processi'], ['The scenario has changed.', 'Lo scenario è cambiato.'], ['Run again', 'Esegui di nuovo'],
  ['in transit', 'in viaggio'], ['violation', 'violazione'], ['will be lost', 'verrà perso'], ['processing', 'in elaborazione'],
  ['link down', 'collegamento interrotto'], ['Originated by', 'Originati da'],
  ['Configuration', 'Configurazione'], ['Code', 'Codice'], ['Timing', 'Tempi'], ['Scenario', 'Scenario'], ['State', 'Stato'], ['Stack', 'Stack'],
  ['Main algorithm', 'Algoritmo principale'], ['Add module', 'Aggiungi modulo'], ['Insert symbol', 'Inserisci simbolo'],
  ['Algorithm code', 'Codice dell\'algoritmo'], ['Language quick reference', 'Guida rapida al linguaggio'],
  ['No errors: the code is consistent with the assumed model.', 'Nessun errore: il codice è coerente con il modello assunto.'],
  ['Presets', 'Preset'], ['Custom', 'Personalizzato'],
  ['Parameters edited by hand. Pick a preset to start again from a known configuration.', 'Parametri modificati a mano. Scegli un preset per ripartire da una configurazione nota.'],
  ['Ideal synchronous', 'Sincrono ideale'], ['Realistic synchronous', 'Sincrono realistico'], ['Timed synchronous', 'Sincrono temporizzato'],
  ['Partially synchronous', 'Parzialmente sincrono'], ['Asynchronous', 'Asincrono'],
  ['Lockstep rounds: no violation can happen. This is the textbook model.', 'Round in lockstep: nessuna violazione è possibile. È il modello dei libri di testo.'],
  ['The algorithm believes in rounds; the network has long tails and clocks drift. Late messages become omissions.', 'L\'algoritmo crede nei round; la rete ha code lunghe e i clock derivano. I messaggi in ritardo diventano omissioni.'],
  ['DELTA is known and respected by the network; clocks do not drift.', 'DELTA è noto e la rete lo rispetta; i clock non derivano.'],
  ['Before GST delays are heavy-tailed; after GST a bound exists, unknown to the algorithm.', 'Prima di GST i ritardi hanno code pesanti; dopo GST esiste un limite, ignoto all\'algoritmo.'],
  ['No bounds on delays, steps or clocks. DELTA, PHI and RHO do not exist for the algorithm.', 'Nessun limite su ritardi, passi e clock. Per l\'algoritmo DELTA, PHI e RHO non esistono.'],
  ['Assumed model', 'Modello assunto'], ['what the algorithm believes', 'ciò che l\'algoritmo crede'],
  ['Actual model', 'Modello effettivo'], ['what the system really does', 'ciò che il sistema fa davvero'],
  ['Synchrony', 'Sincronia'], ['Synchronous rounds', 'Round sincroni'], ['unknown', 'unknown'],
  ['Round execution', 'Esecuzione dei round'], ['Ideal lockstep', 'Lockstep ideale'], ['Emulated on local clocks', 'Emulati sui clock locali'],
  ['Round length on screen', 'Durata del round sullo schermo'],
  ['Each process opens round r when its own clock reads r·(DELTA+PHI).', 'Ogni processo apre il round r quando il suo clock segna r·(DELTA+PHI).'],
  ['When reality exceeds the assumption', 'Quando la realtà supera l\'assunzione'], ['Deliver late', 'Consegna in ritardo'],
  ['Discard (becomes an omission)', 'Scarta (diventa un\'omissione)'], ['Stop the simulation', 'Ferma la simulazione'],
  ['Delay', 'Ritardo'], ['Delay distribution', 'Distribuzione dei ritardi'], ['Upper bound', 'Limite superiore'], ['none', 'nessuno'],
  ['FIFO channels', 'Canali FIFO'], ['Spike probability', 'Probabilità di picco'], ['Spike delay', 'Ritardo del picco'],
  ['Loss', 'Perdita'], ['Duplication', 'Duplicazione'], ['Step duration', 'Durata del passo'], ['Clock offset', 'Offset del clock'],
  ['Clock drift', 'Deriva del clock'], ['GST', 'GST'], ['Delay before GST', 'Ritardo prima di GST'], ['same as above', 'come sopra'],
  ['Simultaneous events', 'Eventi simultanei'], ['Stable order by process', 'Ordine stabile per processo'], ['Random order (from the seed)', 'Ordine casuale (dal seme)'],
  ['The delay distribution is not valid.', 'La distribuzione dei ritardi non è valida.'],
  ['External inputs', 'Input esterni'], ['Faults', 'Guasti'], ['No faults scheduled.', 'Nessun guasto programmato.'],
  ['Type', 'Tipo'], ['Crash', 'Crash'], ['Recovery', 'Ripartenza'], ['Link failure', 'Guasto di collegamento'], ['Partition', 'Partizione'],
  ['Process', 'Processo'], ['At', 'A'], ['Between', 'Tra'], ['and', 'e'], ['First process', 'Primo processo'], ['Second process', 'Secondo processo'],
  ['Groups', 'Gruppi'], ['From', 'Da'], ['Until', 'Fino a'], ['forever', 'per sempre'], ['Add fault', 'Aggiungi guasto'], ['Remove', 'Rimuovi'],
  ['Simulated duration', 'Durata simulata'], ['Stop at the first failed assertion', 'Fermati alla prima asserzione violata'],
  ['Select a process in the topology to see its state at the cursor time.', 'Seleziona un processo nella topologia per vederne lo stato all\'istante del cursore.'],
  ['Run the simulation to inspect the state.', 'Esegui la simulazione per ispezionare lo stato.'],
  ['This process did not exist in the last run.', 'Questo processo non esisteva nell\'ultima esecuzione.'],
  ['status', 'stato'], ['running', 'attivo'], ['local clock', 'clock locale'], ['offset', 'offset'], ['drift', 'deriva'], ['round', 'round'],
  ['No event processed yet.', 'Nessun evento ancora elaborato.'], ['No state variables.', 'Nessuna variabile di stato.'],
  ['changed in the last step', 'cambiato nell\'ultimo passo'], ['Latest outputs', 'Ultimi output'], ['None.', 'Nessuno.'],
  ['Run the simulation to see how events move through the module stack.', 'Esegui la simulazione per vedere come gli eventi attraversano lo stack dei moduli.'],
  ['Application', 'Applicazione'], ['inputs and outputs', 'input e output'], ['Network', 'Rete'], ['Rounds', 'Round'],
  ['provided by the simulator', 'fornita dal simulatore'], ['Nothing has happened on this process yet.', 'Su questo processo non è ancora successo nulla.'],
  ['The run is long: only its first 200,000 local events were recorded.', 'L\'esecuzione è lunga: sono stati registrati solo i primi 200.000 eventi locali.'],
  ['Execution', 'Esecuzione'], ['Go to start', 'Vai all\'inizio'], ['Start (Home)', 'Inizio (Home)'], ['Previous event', 'Evento precedente'],
  ['Previous event (←)', 'Evento precedente (←)'], ['Play', 'Riproduci'], ['Pause', 'Pausa'], ['Play or pause (space)', 'Riproduci o pausa (spazio)'],
  ['Next event', 'Evento successivo'], ['Next event (→)', 'Evento successivo (→)'], ['Go to end', 'Vai alla fine'], ['End (End)', 'Fine (Fine)'],
  ['Playback speed', 'Velocità di riproduzione'], ['Event by event', 'Evento per evento'], ['Auto speed', 'Velocità automatica'],
  ['Autoplay', 'Avvio automatico'], ['Start playing after every run', 'Avvia la riproduzione dopo ogni esecuzione'], ['Position in time', 'Posizione nel tempo'],
  ['Causality', 'Causalità'], ['Click an event on the diagram to see what caused it and what it caused', 'Clicca un evento sul diagramma per vedere cosa lo ha causato e cosa ha causato'],
  ['Future', 'Futuro'], ['Show events after the cursor, faded', 'Mostra, sbiaditi, gli eventi dopo il cursore'],
  ['Follow', 'Segui'], ['Scroll the diagram to keep the cursor in view', 'Scorri il diagramma per tenere visibile il cursore'],
  ['Zoom', 'Zoom'], ['Zoom out', 'Riduci'], ['Zoom in', 'Ingrandisci'], ['Zoom in (Ctrl + wheel)', 'Ingrandisci (Ctrl + rotella)'],
  ['Action', 'Azione'], ['Zoom to where the action is', 'Inquadra dove succede qualcosa'], ['All', 'Tutto'], ['Show the whole run', 'Mostra tutta l\'esecuzione'],
  ['Clear', 'Pulisci'], ['delivered', 'consegnato'], ['lost or discarded', 'perso o scartato'], ['output', 'output'], ['crashed', 'in crash'],
  ['recovery', 'ripartenza'], ['network cut', 'rete interrotta'], ['Events', 'Eventi'], ['Event filter', 'Filtro eventi'],
  ['Outputs', 'Output'], ['Inputs', 'Input'], ['Violations', 'Violazioni'], ['Dropped messages', 'Messaggi scartati'],
  ['Warnings and errors', 'Avvisi ed errori'], ['Logs and assertions', 'Log e asserzioni'], ['No events match this filter.', 'Nessun evento corrisponde al filtro.'],
  ['Export the scenario', 'Esporta lo scenario'],
  ['The JSON file holds topology, code, timing model, inputs, faults and seed: opening it again reproduces the same run.', 'Il file JSON contiene topologia, codice, modello dei tempi, input, guasti e seme: riaprendolo si ottiene la stessa esecuzione.'],
  ['Shareable link', 'Link da condividere'], ['Images of the current view', 'Immagini della vista corrente'], ['Diagram as SVG', 'Diagramma in SVG'],
  ['Diagram as PNG', 'Diagramma in PNG'], ['Graph as SVG', 'Grafo in SVG'], ['Copy JSON', 'Copia JSON'], ['Copy link', 'Copia link'],
  ['Save file', 'Salva file'], ['Close', 'Chiudi'], ['Import a scenario', 'Importa uno scenario'], ['JSON file', 'File JSON'],
  ['Or paste its content', 'Oppure incollane il contenuto'], ['Cancel', 'Annulla'], ['Theme', 'Tema'], ['Follow the system', 'Come il sistema'],
  ['Light', 'Chiaro'], ['Dark', 'Scuro'], ['Colors', 'Colori'], ['Standard', 'Standard'],
  ['Easier to tell apart (color vision deficiency)', 'Più distinguibili (deficit nella visione dei colori)'], ['Language', 'Lingua'],
  ['The language setting translates the interface. Code, diagnostics from the checker and the documentation stay in English.', 'La lingua traduce l\'interfaccia. Il codice, la diagnostica del checker e la documentazione restano in inglese.'],
  ['Presentation mode', 'Modalità presentazione'], ['Welcome tour', 'Visita guidata'], ['Documentation', 'Documentazione'],
  ['Run', 'Esegui'], ['Play or pause', 'Riproduci o pausa'], ['Previous or next event', 'Evento precedente o successivo'],
  ['Start or end of the run', 'Inizio o fine dell\'esecuzione'], ['Select, Node, Link, Delete tools', 'Strumenti Seleziona, Nodo, Collegamento, Elimina'],
  ['Delete the selected process or link', 'Elimina il processo o il collegamento selezionato'],
  ['Clear the selection, or leave presentation mode', 'Annulla la selezione o esci dalla modalità presentazione'],
  ['Full screen', 'Schermo intero'], ['This list', 'Questo elenco'], ['+ wheel', '+ rotella'], ['Zoom the diagram', 'Zoom del diagramma'],
  ['Shortcuts work everywhere except while typing in a text field.', 'Le scorciatoie funzionano ovunque, tranne mentre si scrive in un campo di testo.'],
  ['Examples', 'Esempi'], ['Topic', 'Argomento'], ['Exit presentation', 'Esci dalla presentazione'],
  ['Skip', 'Salta'], ['Back', 'Indietro'], ['Next', 'Avanti'], ['Done', 'Fine'],
  ['Crash here', 'Crash qui'], ['Recover here', 'Riparti qui'], ['Isolate here', 'Isola qui'], ['Cut here', 'Interrompi qui'],
  ['Inject event', 'Inietta evento'], ['Event to inject', 'Evento da iniettare'], ['Event arguments', 'Argomenti dell\'evento'],
  ['arguments, e.g. "hello"', 'argomenti, es. "ciao"'], ['never', 'mai'], ['Isolation duration', 'Durata dell\'isolamento'],
  ['Duration, empty for forever', 'Durata, vuoto per sempre'], ['no neighbors', 'nessun vicino'], ['no faults scheduled', 'nessun guasto programmato'],
  ['Enabled', 'Attivo'], ['Unchecked: the link is down for the whole run', 'Non selezionato: il collegamento è interrotto per tutta l\'esecuzione'],
  ['global', 'globale'], ['Link loss', 'Perdita del collegamento'], ['Link delay', 'Ritardo del collegamento'],
  ['Link failure duration', 'Durata del guasto'], ['take the link down for', 'interrompi il collegamento per'],
  ['Go to send', 'Vai all\'invio'], ['Go to arrival', 'Vai all\'arrivo'], ['This message is not part of the current run.', 'Questo messaggio non appartiene all\'esecuzione corrente.'],
  ['Click the source process, then the destination.', 'Clicca il processo di partenza, poi quello di arrivo.'],
  ['Click an empty spot to add a process.', 'Clicca un punto vuoto per aggiungere un processo.'],
  ['Click a process or a link to delete it.', 'Clicca un processo o un collegamento per eliminarlo.'],
  ['No processes yet: use the Node tool or a generator.', 'Nessun processo: usa lo strumento Nodo o un generatore.'],
  ['Event of', 'Evento di'], ['Press Run to see the space-time diagram.', 'Premi Esegui per vedere il diagramma spazio-tempo.'],
  ['Add some processes to get started.', 'Aggiungi qualche processo per iniziare.'], ['partition', 'partizione'], ['down', 'interrotto'],
  ['Simulating…', 'Simulazione in corso…'], ['Preparing…', 'Preparazione…'], ['Preparing the file…', 'Preparazione del file…'],
  ['Copied to the clipboard.', 'Copiato negli appunti.'], ['Save cancelled.', 'Salvataggio annullato.'],
  ['Copying is not allowed here: select the text and copy it manually.', 'Qui la copia non è consentita: seleziona il testo e copialo a mano.'],
  ['Saving files is not available here: use Copy JSON.', 'Qui non è possibile salvare file: usa Copia JSON.'],
  ['Saving files is not available here.', 'Qui non è possibile salvare file.'], ['A save request is already open.', 'Una richiesta di salvataggio è già aperta.'],
  ['Links are not supported in this browser', 'Questo browser non supporta i link'], ['Run the simulation first.', 'Esegui prima la simulazione.'],
  ['Loaded the empty scenario.', 'Caricato lo scenario vuoto.'], ['Scenario imported.', 'Scenario importato.'],
  ['Previous scenario restored.', 'Scenario precedente ripristinato.'], ['Opened the shared scenario.', 'Aperto lo scenario condiviso.'],
  ['That link already exists.', 'Il collegamento esiste già.'], ['Topology changed: press Run to simulate again.', 'Topologia modificata: premi Esegui per simulare di nuovo.'],
  ['Click an event on the diagram to see its causal past and future.', 'Clicca un evento sul diagramma per vederne passato e futuro causali.'],
  ['Presentation mode: arrows or a clicker step through events, P or Esc to leave.', 'Modalità presentazione: le frecce o un telecomando scorrono gli eventi, P o Esc per uscire.'],
  ['Fix the syntax errors in the code before adding a module.', 'Correggi gli errori di sintassi prima di aggiungere un modulo.'],
  ['Invalid time: use a duration such as 1.5s', 'Istante non valido: usa una durata come 1.5s'],
  ['The link does not contain a valid scenario: loading the last saved one.', 'Il link non contiene uno scenario valido: carico l\'ultimo salvato.'],
  ['The link does not contain a valid scenario.', 'Il link non contiene uno scenario valido.'],
  ['Undo', 'Annulla'], ['Getting started', 'Primi passi'], ['Empty scenario', 'Scenario vuoto'],
  ['A small ring and a starter program to write your own algorithm.', 'Un piccolo anello e un programma di partenza per scrivere il tuo algoritmo.'],
  ['Broadcast', 'Broadcast'], ['Leader election', 'Elezione del leader'], ['Consensus', 'Consenso'], ['Failure detection', 'Rilevamento dei guasti'],
  ['asynchronous', 'asincrono'], ['partially synchronous', 'parzialmente sincrono'], ['synchronous rounds', 'round sincroni'], ['timed synchronous', 'sincrono temporizzato'],
  // example titles and summaries
  ['Flooding broadcast (asynchronous)', 'Broadcast per inondazione (asincrono)'],
  ['Ring leader election, Chang-Roberts (asynchronous)', 'Elezione su anello, Chang-Roberts (asincrono)'],
  ['FloodSet consensus (synchronous rounds)', 'Consenso FloodSet (round sincroni)'],
  ['Failure detector ◇P (partially synchronous)', 'Failure detector ◇P (parzialmente sincrono)'],
  ['Failure detector across a partition and a recovery', 'Failure detector con partizione e ripartenza'],
  ['Reliable broadcast when the sender crashes', 'Reliable broadcast con crash del mittente'],
  ['Causal order broadcast: questions before answers', 'Broadcast causale: domande prima delle risposte'],
  ['Gossip: spreading a rumor', 'Gossip: diffondere una voce'],
  ['Logical clocks: Lamport and vector', 'Clock logici: Lamport e vettoriale'],
  ['Majority-quorum register (read and write)', 'Registro a quorum maggioritario (lettura e scrittura)'],
  ['Total order broadcast with a sequencer', 'Total order broadcast con sequenziatore'],
  ['Paxos: consensus on one value', 'Paxos: consenso su un valore'],
  ['Ben-Or: consensus with a coin', 'Ben-Or: consenso con una moneta'],
  ['When the processes cannot agree, they toss a coin: randomness buys the termination that FLP denies.', 'Quando i processi non riescono ad accordarsi lanciano una moneta: la casualità compra la terminazione che FLP nega.'],
  ['Two proposers compete, majorities meet, and one value wins: safety never depends on who crashes.', 'Due proponenti competono, le maggioranze si incontrano e vince un valore: la sicurezza non dipende da chi cade.'],
  ['One process decides the order and everybody follows it — until that process is the one that crashes.', 'Un processo decide l\'ordine e tutti lo seguono, finché a cadere non è proprio quel processo.'],
  ['Majorities keep a replicated register correct; lose one and reads and writes simply stop.', 'Le maggioranze tengono corretto un registro replicato; persa la maggioranza, letture e scritture si fermano.'],
  ['Replication', 'Replicazione'],
  ['Chandy-Lamport snapshot on FIFO channels', 'Snapshot di Chandy-Lamport su canali FIFO'],
  ['A Lamport counter and a vector clock side by side: what each one can and cannot tell you.', 'Un contatore di Lamport e un clock vettoriale a confronto: cosa sa dire ciascuno e cosa no.'],
  ['Markers cut the execution consistently — until the channels stop being FIFO and coins go missing.', 'I marker tagliano l\'esecuzione in modo consistente, finché i canali non smettono di essere FIFO e le monete spariscono.'],
  ['Logical time', 'Tempo logico'],
  ['Global state', 'Stato globale'],
  ['Perfect failure detector (timed synchronous)', 'Failure detector perfetto (sincrono temporizzato)'],
  ['Eventual leader election Ω (partially synchronous)', 'Elezione eventuale del leader Ω (parzialmente sincrono)'],
  ['Mutual exclusion, Ricart-Agrawala (asynchronous)', 'Mutua esclusione, Ricart-Agrawala (asincrono)'],
  ['Two-phase commit and the blocked participants', 'Commit a due fasi e i partecipanti bloccati'],
  ['With known bounds, a missed heartbeat means a crash: nobody correct is ever suspected.', 'Con limiti noti, un heartbeat mancato significa crash: nessun processo corretto viene mai sospettato.'],
  ['Heartbeats with a growing timeout: after GST everybody trusts the same correct leader.', 'Heartbeat con timeout crescente: dopo GST tutti si fidano dello stesso leader corretto.'],
  ['Timestamped requests and deferred replies keep two processes out of the critical section.', 'Richieste con timestamp e risposte rinviate tengono due processi fuori dalla sezione critica.'],
  ['Everybody commits together; crash the coordinator before it announces and the others are blocked.', 'O tutti commettono, o nessuno; se il coordinatore cade prima di annunciare, gli altri restano bloccati.'],
  ['Coordination', 'Coordinamento'],
  ['Two messages spread across a grid; each process forwards what it has not seen yet.', 'Due messaggi si diffondono su una griglia; ogni processo inoltra ciò che non ha ancora visto.'],
  ['Identifiers travel around a directed ring until the largest one comes back.', 'Gli identificatori girano su un anello orientato finché il più grande non torna indietro.'],
  ['Consensus in f + 1 rounds, and what happens when the rounds are only an assumption.', 'Consenso in f + 1 round, e cosa succede quando i round sono solo un\'ipotesi.'],
  ['Heartbeats and a growing timeout: wrong suspicions before GST, a crash detected after.', 'Heartbeat e timeout crescente: sospetti sbagliati prima di GST, un crash rilevato dopo.'],
  ['The same detector through a network partition, a crash and a recovery.', 'Lo stesso detector attraverso una partizione, un crash e una ripartenza.'],
  ['The sender crashes on a lossy network; relays make sure every correct process gets the news.', 'Il mittente cade su una rete che perde messaggi; i rilanci fanno arrivare la notizia a tutti i processi corretti.'],
  ['Vector clocks keep answers after their questions, even when the network reorders them.', 'I vector clock tengono le risposte dopo le domande, anche quando la rete le riordina.'],
  ['A rumor spreads to random neighbors; reach and cost depend on fanout and rounds.', 'Una voce si diffonde a vicini casuali; copertura e costo dipendono da fanout e round.'],
  // tour
  ['The graph', 'Il grafo'],
  ['Processes and the links between them. Messages travel along the links as packets. Click a process or a packet to inspect it.', 'I processi e i collegamenti tra loro. I messaggi viaggiano sui collegamenti come pacchetti. Clicca un processo o un pacchetto per ispezionarlo.'],
  ['The algorithm', 'L\'algoritmo'],
  ['Algorithms are written in Upon, the event-driven pseudocode of the textbooks. Errors appear under the editor as you type.', 'Gli algoritmi si scrivono in Upon, lo pseudocodice a eventi dei libri di testo. Gli errori compaiono sotto l\'editor mentre scrivi.'],
  ['The timing model', 'Il modello dei tempi'],
  ['Choose what the algorithm assumes and how the network really behaves. When reality breaks the assumption, the message turns red.', 'Scegli cosa assume l\'algoritmo e come si comporta davvero la rete. Quando la realtà viola l\'assunzione, il messaggio diventa rosso.'],
  ['Inputs and faults', 'Input e guasti'],
  ['Tell processes what to do, and schedule crashes, recoveries, link failures and partitions.', 'Di\' ai processi cosa fare e programma crash, ripartenze, guasti di collegamento e partizioni.'],
  ['Simulate the scenario. The same seed always gives the same run.', 'Simula lo scenario. Lo stesso seme dà sempre la stessa esecuzione.'],
  ['Playback', 'Riproduzione'],
  ['Play, pause and step. "Event by event" is the easiest speed to follow an algorithm.', 'Riproduci, metti in pausa e avanza. "Evento per evento" è la velocità più comoda per seguire un algoritmo.'],
  ['The space-time diagram', 'Il diagramma spazio-tempo'],
  ['One line per process, one arrow per message. Tick Causality and click an event to see what caused it.', 'Una linea per processo, una freccia per messaggio. Attiva Causalità e clicca un evento per vedere cosa lo ha causato.'],
  ['Start from a classic algorithm. Each example comes with experiments to try. The ⚙ menu brings this tour back.', 'Parti da un algoritmo classico. Ogni esempio propone esperimenti da provare. Il menu ⚙ riapre questa visita.'],
  // message status and extras
  ['still in transit when the run ended', 'ancora in viaggio a fine esecuzione'], ['lost by the network', 'perso dalla rete'],
  ['discarded because late', 'scartato perché in ritardo'], ['recipient crashed', 'destinatario in crash'], ['no link', 'nessun collegamento'],
  ['dropped by a link failure or a partition', 'scartato per un guasto di collegamento o una partizione'],
  ['violates the assumed model', 'viola il modello assunto'], ['duplicate', 'duplicato'],
  // log labels and engine messages
  ['input', 'input'], ['fault', 'guasto'], ['dropped', 'scartato'], ['warning', 'avviso'], ['error', 'errore'],
  ['assertion failed', 'asserzione violata'], ['log', 'log'], ['network partition', 'partizione di rete'],
  ['Time limit reached', 'Raggiunto il limite di tempo'], ['No more events in the queue', 'Nessun altro evento in coda'],
  ['Runtime error', 'Errore di esecuzione'], ['Timing violation (policy: halt)', 'Violazione temporale (politica: ferma)'],
  ['Syntax error', 'Errore di sintassi'], ['The code contains errors', 'Il codice contiene errori'], ['No algorithm is defined', 'Nessun algoritmo definito']
].forEach(([en, it]) => M(en, it));

// ---------------------------------------------------------------- patterns
const plural = (n, one, many) => (+n === 1 ? one : many);
P(/^(\d+) messages?$/, m => m[1] + ' ' + plural(m[1], 'messaggio', 'messaggi'));
P(/^(\d+) delivered$/, m => m[1] + ' ' + plural(m[1], 'consegnato', 'consegnati'));
P(/^(\d+) lost$/, m => m[1] + ' ' + plural(m[1], 'perso', 'persi'));
P(/^(\d+) violations?$/, m => m[1] + ' ' + plural(m[1], 'violazione', 'violazioni'));
P(/^(\d+) outputs?$/, m => m[1] + ' output');
P(/^(\d+) events could have caused it$/, m => m[1] + ' eventi potrebbero averlo causato');
P(/^(\d+) events it could affect$/, m => m[1] + ' eventi che può influenzare');
P(/^(\d+) concurrent$/, m => m[1] + ' ' + plural(m[1], 'concorrente', 'concorrenti'));
P(/^([\d.]+) (ms|s) per second$/, m => m[1] + ' ' + m[2] + ' al secondo');
P(/^At (.+):$/, m => 'A ' + m[1] + ':');
P(/^at (.+):$/, m => 'a ' + m[1] + ':');
P(/^(p\d+) at t = (.+)$/, m => m[1] + ' a t = ' + m[2]);
P(/^at t = (.+)\. Requests go down \(blue\), indications come up \(green\)\.$/, m => 'a t = ' + m[1] + '. Le richieste scendono (blu), le indicazioni salgono (verde).');
P(/^Latest events on (p\d+)$/, m => 'Ultimi eventi su ' + m[1]);
P(/^Module stack of (p\d+)$/, m => 'Stack dei moduli di ' + m[1]);
P(/^Process (p\d+)$/, m => 'Processo ' + m[1]);
P(/^(\d+) processes, (\d+) links\. Select an element to edit it, drag processes to move them, click a message in flight to inspect it\.$/,
  m => m[1] + ' processi, ' + m[2] + ' collegamenti. Seleziona un elemento per modificarlo, trascina i processi per spostarli, clicca un messaggio in viaggio per ispezionarlo.');
P(/^neighbors: (.+)$/, m => 'vicini: ' + m[1]);
P(/^(\d+) faults? scheduled$/, m => m[1] + ' ' + plural(m[1], 'guasto programmato', 'guasti programmati'));
P(/^Source: (p\d+)\. Now click the destination \(Esc to cancel\)\.$/, m => 'Partenza: ' + m[1] + '. Ora clicca l\'arrivo (Esc per annullare).');
P(/^line (\d+)$/, m => 'riga ' + m[1]);
P(/^crashed at (.+)$/, m => 'in crash da ' + m[1]);
P(/^running, recovered at (.+)$/, m => 'attivo, ripartito a ' + m[1]);
P(/^Loaded: (.+)\.$/, m => 'Caricato: ' + tr(m[1]) + '.');
P(/^(Time limit reached|No more events in the queue): (\d+) events processed\.(.*)$/,
  m => tr(m[1]) + ': ' + m[2] + ' eventi elaborati.' + (m[3] ? m[3].replace(' Warnings:', ' Avvisi:') : ''));
P(/^Limit of (\d+) events reached: (\d+) events processed\.$/, m => 'Raggiunto il limite di ' + m[1] + ' eventi: ' + m[2] + ' eventi elaborati.');
P(/^(p\d+) crashes at (.+)$/, m => m[1] + ' va in crash a ' + m[2]);
P(/^(p\d+) recovers at (.+)$/, m => m[1] + ' riparte a ' + m[2]);
P(/^(p\d+) crashes at (.+)\.$/, m => m[1] + ' va in crash a ' + m[2] + '.');
P(/^(p\d+) recovers at (.+)\.$/, m => m[1] + ' riparte a ' + m[2] + '.');
P(/^(p\d+) is isolated at (.+)\.$/, m => m[1] + ' viene isolato a ' + m[2] + '.');
P(/^Link (p\d+–p\d+) goes down at (.+)\.$/, m => 'Il collegamento ' + m[1] + ' si interrompe a ' + m[2] + '.');
P(/^link (p\d+–p\d+) down from (\S+)(?: until (\S+)| onwards)$/, m => 'collegamento ' + m[1] + ' interrotto da ' + m[2] + (m[3] ? ' fino a ' + m[3] : ' in poi'));
P(/^partition (.+) from (\S+)(?: until (\S+)| onwards)$/, m => 'partizione ' + m[1] + ' da ' + m[2] + (m[3] ? ' fino a ' + m[3] : ' in poi'));
P(/^Fault added: (.+)\.$/, m => 'Guasto aggiunto: ' + tr(m[1]) + '.');
P(/^Injected (\w+) on (p\d+) at (.+)\.$/, m => 'Iniettato ' + m[1] + ' su ' + m[2] + ' a ' + m[3] + '.');
P(/^No such process: (.+)$/, m => 'Processo inesistente: ' + m[1]);
P(/^(p\d+) has no events in this run\.$/, m => m[1] + ' non ha eventi in questa esecuzione.');
P(/^(\S+) is already in the code\.$/, m => m[1] + ' è già nel codice.');
P(/^Added (.+)\. Use it with "uses (\w+) as …"\.$/, m => 'Aggiunti ' + m[1] + '. Usalo con "uses ' + m[2] + ' as …".');
P(/^Could not open the scenario: (.+)$/, m => 'Impossibile aprire lo scenario: ' + m[1]);
P(/^Downloading (.+)\.$/, m => 'Download di ' + m[1] + '.');
P(/^Saved (.+)\.$/, m => 'Salvato ' + m[1] + '.');
P(/^(p\d+ [—→] p\d+) \((partition|link down|disabled)\)$/, m => m[1] + ' (' + ({ partition: 'partizione', 'link down': 'collegamento interrotto', disabled: 'disattivato' })[m[2]] + ')');
P(/^sent (?:at )?(.+?), arrives (?:at )?(.+?) \(delay (.+?)\)(, round \d+)?(\. Click to select\.)?$/,
  m => 'inviato ' + m[1] + ', arriva ' + m[2] + ' (ritardo ' + m[3] + ')' + (m[4] || '') + (m[5] ? '. Clic per selezionare.' : ''));
P(/^sent (?:at )?(.+?)(, round \d+)?(\. Click to select\.)?$/, m => 'inviato ' + m[1] + (m[2] || '') + (m[3] ? '. Clic per selezionare.' : ''));
P(/^Median (.+?), 99th percentile (.+?)\.(.*)$/, m => {
  let rest = m[3]
    .replace(/ ([\d.]+)% of messages exceed DELTA( \(after GST\))?\./, (x, p, g) => ' ' + p.replace('.', ',') + '% dei messaggi supera DELTA' + (g ? ' (dopo GST)' : '') + '.')
    .replace(' With emulated rounds the usable window is about DELTA + PHI, shrunk by clock offsets.', ' Con i round emulati la finestra utile è circa DELTA + PHI, ridotta dagli offset dei clock.')
    .replace(' The amber line is the delay before GST.', ' La linea ambra è il ritardo prima di GST.');
  return 'Mediana ' + m[1] + ', 99° percentile ' + m[2] + '.' + rest;
});
// engine log messages
P(/^(p\d+) crashes$/, m => m[1] + ' va in crash');
P(/^(p\d+) recovers \(volatile state reset\)$/, m => m[1] + ' riparte (stato volatile azzerato)');
P(/^network partition: (.+)$/, m => 'partizione di rete: ' + m[1]);
P(/^partition healed: (.+)$/, m => 'partizione risolta: ' + m[1]);
P(/^link (p\d+–p\d+) goes down$/, m => 'il collegamento ' + m[1] + ' si interrompe');
P(/^link (p\d+–p\d+) is back up$/, m => 'il collegamento ' + m[1] + ' torna attivo');
P(/^message to (p\d+) lost( \(omission\))?$/, m => 'messaggio per ' + m[1] + ' perso' + (m[2] ? ' (omissione)' : ''));
P(/^message to (p\d+) dropped: (.+)$/, m => 'messaggio per ' + m[1] + ' scartato: ' + tr(m[2]));
P(/^message from (p\d+) dropped in transit: (.+)$/, m => 'messaggio da ' + m[1] + ' scartato in viaggio: ' + tr(m[2]));
P(/^no link to (p\d+)( \(link disabled\))?$/, m => 'nessun collegamento verso ' + m[1] + (m[2] ? ' (collegamento disattivato)' : ''));
P(/^round (\d+) message from (p\d+) arrived after the round ended on (p\d+) \(delay (.+)\)$/,
  m => 'messaggio del round ' + m[1] + ' da ' + m[2] + ' arrivato dopo la fine del round su ' + m[3] + ' (ritardo ' + m[4] + ')');
P(/^delay (.+) exceeds DELTA = (.+) \((p\d+) → (p\d+)\)$/, m => 'ritardo ' + m[1] + ' oltre DELTA = ' + m[2] + ' (' + m[3] + ' → ' + m[4] + ')');
P(/^clock drift (.+) exceeds RHO = (.+)$/, m => 'deriva del clock ' + m[1] + ' oltre RHO = ' + m[2]);
P(/^processing step of (.+) exceeds PHI = (.+)$/, m => 'passo di elaborazione di ' + m[1] + ' oltre PHI = ' + m[2]);
P(/^event (⟨.+⟩) has no handler in (\S+) \(shown once\)$/, m => 'l\'evento ' + m[1] + ' non ha un handler in ' + m[2] + ' (mostrato una volta)');
P(/^(p\d+) is running: recovery ignored$/, m => m[1] + ' è attivo: ripartenza ignorata');
P(/^input (\w+) ignored: (p\d+) is down$/, m => 'input ' + m[1] + ' ignorato: ' + m[2] + ' è in crash');
P(/^([a-z ]+): (.+)$/, m => (IT[m[1]] !== undefined ? IT[m[1]] : null) === null ? null : IT[m[1]] + ': ' + (tr(m[2]) || m[2]));
P(/^(.+), (.+)$/, m => { const parts = m[0].split(', '); const out = parts.map(x => IT[x]); return out.every(x => x !== undefined) ? out.join(', ') : null; });

// library modules shown under "Add module"
const LIBTXT = {
  'Stubborn links: every message is sent again periodically, a bounded number of times.': 'Stubborn links: ogni messaggio viene rinviato periodicamente, un numero limitato di volte.',
  'Stubborn delivery (within the retransmission budget), no creation.': 'consegna ostinata (entro il numero di ritrasmissioni), nessuna creazione.',
  'Perfect links built on stubborn links by discarding duplicates.': 'Perfect links costruiti sugli stubborn links scartando i duplicati.',
  'Reliable delivery, no duplication, no creation (messages are assumed unique).': 'consegna affidabile, nessuna duplicazione, nessuna creazione (i messaggi sono ritenuti unici).',
  'Perfect links with sequence numbers, acknowledgements and retransmission until acknowledged.': 'Perfect links con numeri di sequenza, conferme e ritrasmissione fino alla conferma.',
  'Reliable delivery to correct processes, no duplication, no creation.': 'consegna affidabile ai processi corretti, nessuna duplicazione, nessuna creazione.',
  'FIFO perfect links: per-sender sequence numbers and a reorder buffer.': 'Perfect links FIFO: numeri di sequenza per mittente e un buffer di riordino.',
  'Perfect link properties, plus FIFO delivery per pair of processes.': 'le proprietà dei perfect links, più la consegna FIFO per ogni coppia di processi.',
  'Best-effort broadcast: send the message to every process over perfect links.': 'Best-effort broadcast: invia il messaggio a ogni processo su perfect links.',
  'Validity, no duplication, no creation. If the sender crashes, some processes may miss the message.': 'validità, nessuna duplicazione, nessuna creazione. Se il mittente cade, alcuni processi possono non ricevere il messaggio.',
  'Reliable broadcast without failure detection: every process relays each message once.': 'Reliable broadcast senza rilevamento dei guasti: ogni processo rilancia ogni messaggio una volta.',
  'Validity, no duplication, no creation, agreement among correct processes.': 'validità, nessuna duplicazione, nessuna creazione, accordo tra i processi corretti.',
  'Uniform reliable broadcast: deliver only after a majority has relayed the message.': 'Uniform reliable broadcast: consegna solo dopo che una maggioranza ha rilanciato il messaggio.',
  'Uniform agreement: if any process delivers, every correct process delivers. Needs a correct majority.': 'accordo uniforme: se un processo consegna, lo fanno tutti i processi corretti. Richiede una maggioranza corretta.',
  'FIFO reliable broadcast: messages of each sender are delivered in the order they were sent.': 'FIFO reliable broadcast: i messaggi di ogni mittente sono consegnati nell\'ordine di invio.',
  'Reliable broadcast properties, plus FIFO delivery per sender.': 'le proprietà del reliable broadcast, più la consegna FIFO per mittente.',
  'Causal order broadcast with vector clocks: a message waits until everything it depends on is delivered.': 'Broadcast causale con vector clock: un messaggio attende che sia consegnato tutto ciò da cui dipende.',
  'Reliable broadcast properties, plus causal delivery order.': 'le proprietà del reliable broadcast, più l\'ordine causale di consegna.',
  'Probabilistic broadcast: each process forwards a new message to a few random neighbors for a few rounds.': 'Broadcast probabilistico: ogni processo inoltra un messaggio nuovo a pochi vicini casuali per pochi passaggi.',
  'Probabilistic validity: most processes deliver with high probability; no duplication.': 'validità probabilistica: la maggior parte dei processi consegna con alta probabilità; nessuna duplicazione.'
};
P(/^(\w+): (.+?) Guarantees: (.+)$/, m => LIBTXT[m[2]] ? m[1] + ': ' + LIBTXT[m[2]] + ' Garanzie: ' + (LIBTXT[m[3]] || m[3]) : null);
M('Links', 'Collegamenti');
M('or', 'o');
M('Run over many seeds', 'Esecuzione su molti semi');
M('The same scenario, one run per seed, in the background. Properties and failed assertions are reported per seed; click a seed to open that run.',
  'Lo stesso scenario, un\'esecuzione per seme, in background. Proprietà e asserzioni violate sono riportate per seme; clicca un seme per aprire quell\'esecuzione.');
M('Seeds', 'Semi');
M('Behaviour profile', 'Profilo di comportamento');
M('About this project', 'Informazioni sul progetto');
M('The scenario as JSON', 'Lo scenario in JSON');
M('Space-time diagram: one line per process, one arrow per message', 'Diagramma spazio-tempo: una linea per processo, una freccia per messaggio'); M('Author', 'Autore');
M('A playground for distributed algorithms: write them in the pseudocode of the textbooks, run them against a network that does not keep its promises, and check the properties they should satisfy.',
  'Un laboratorio per algoritmi distribuiti: scrivili nello pseudocodice dei libri di testo, eseguili contro una rete che non mantiene le promesse e verifica le proprietà che dovrebbero soddisfare.');
M('Repository and issues', 'Repository e segnalazioni');
M('MIT licensed. Contributions, corrections and new algorithms are welcome.', 'Licenza MIT. Contributi, correzioni e nuovi algoritmi sono benvenuti.');
M('Copy the profile as a Markdown report', 'Copia il profilo come report Markdown'); M('Copy report', 'Copia report');
P(/^Version (.+)$/, m => 'Versione ' + m[1]);
M('declare it in state', 'dichiarala in state'); M('add a module that implements it', 'aggiungi un modulo che la implementa');
M('declare the interface', 'dichiara l\'interfaccia'); M('add the handler', 'aggiungi l\'handler');
M('keyword', 'parola chiave'); M('built-in', 'predefinito'); M('built-in function', 'funzione predefinita');
M('event', 'evento'); M('instance', 'istanza');
P(/^"(\w+)" declared in state\.$/, m => '"' + m[1] + '" dichiarata in state.');
P(/^Interface "(\w+)" added: fill in its events\.$/, m => 'Interfaccia "' + m[1] + '" aggiunta: definisci i suoi eventi.');
P(/^Handler for (\w+) added\.$/, m => 'Handler per ' + m[1] + ' aggiunto.');
P(/^(implements|uses) (\w+)$/, m => (m[1] === 'uses' ? 'usa ' : 'implementa ') + m[2]);
P(/^(request|indication) of (\w+)( with (\d+) argument\(s\))?$/, m =>
  (m[1] === 'request' ? 'richiesta di ' : 'indicazione di ') + m[2] + (m[4] ? ' con ' + m[4] + ' argomenti' : ''));
P(/^state of (\w+)$/, m => 'stato di ' + m[1]);
P(/^parameter of (\w+)$/, m => 'parametro di ' + m[1]);
P(/^function with (\d+) argument\(s\)$/, m => 'funzione con ' + m[1] + ' argomenti');
M('holds', 'regge');
P(/^holds, (\d+)% of the processes produce an output$/, m => 'regge, il ' + m[1] + '% dei processi produce un output');
P(/^(\d+) of (\d+) run\(s\) ended with an error$/, m => m[1] + ' esecuzioni su ' + m[2] + ' terminate con un errore');
P(/^(\w+) broken in (\d+)\/(\d+)$/, m => m[1] + ' violata in ' + m[2] + '/' + m[3]);
P(/^(\d+) run\(s\) failed an assertion$/, m => m[1] + ' esecuzioni con un\'asserzione violata');
P(/^Every condition held: (.+)\.$/, m => 'Ogni condizione ha retto: ' + (tr(m[1]) || m[1]) + '.');
P(/^Holds under (.+)\. Breaks under (.+)\.$/, m => 'Regge con ' + m[1] + '. Si rompe con ' + m[2] + '.');
M('Run the algorithm over a grid of fault conditions and summarize how it behaves', 'Esegui l\'algoritmo su una griglia di condizioni di guasto e riassumi come si comporta');
M('condition', 'condizione'); M('messages', 'messaggi'); M('reach', 'copertura'); M('settles', 'si assesta');
M('A batch is already running.', 'Un lotto è già in esecuzione.');
M('A profile runs every condition: try at most 60 seeds.', 'Un profilo esegue ogni condizione: al massimo 60 semi.');
P(/^condition (\d+) \/ (\d+): (.+)$/, m => 'condizione ' + m[1] + ' / ' + m[2] + ': ' + (tr(m[3]) || m[3]));
P(/^(\d+) condition\(s\) in ([\d.]+) s$/, m => m[1] + ' condizioni in ' + m[2] + ' s');
P(/^(\d+) seed\(s\) per condition\. Reach is the share of processes that produced an output; settles is the median time of the last one\.$/,
  m => m[1] + ' semi per condizione. La copertura è la quota di processi che ha prodotto un output; "si assesta" è il tempo mediano dell\'ultimo.');
P(/^open seed (\d+)$/, m => 'apri il seme ' + m[1]);
P(/^(\d+) failed$/, m => m[1] + ' fallite');
M('no faults', 'nessun guasto'); M('one crash', 'un crash'); M('two crashes', 'due crash');
M('crash and recovery', 'crash e ripartenza'); M('one pause', 'una pausa'); M('one partition', 'una partizione');
M('partitions 1.5/s', 'partizioni 1.5/s'); M('link failures 0.5/s', 'guasti di collegamento 0.5/s');
M('omissions 0.5/s', 'omissioni 0.5/s'); M('a zone crashes', 'una zona cade');
M('When', 'Quando'); M('Condition', 'Condizione'); M('For', 'Per');
M('Fire the fault the first moment a condition holds, instead of at a fixed time', 'Fai scattare il guasto appena una condizione è vera, invece che a un istante fisso');
M('Condition that fires the fault', 'Condizione che fa scattare il guasto');
M('How long the fault lasts', 'Quanto dura il guasto');
M('e.g. #keys(defined(decision)) ≥ 1', 'es. #keys(defined(decision)) ≥ 1');
M('Only the messages leaving the first group are dropped', 'Si perdono solo i messaggi che escono dal primo gruppo');
P(/^(.+) when (.+)$/, m => (tr(m[1]) || m[1]) + ' quando ' + m[2]);
P(/^fault armed by a condition fired: (.+)$/, m => 'guasto armato scattato: ' + (tr(m[1]) || m[1]));
P(/^fault condition "(.+)" could not be evaluated: (.+)$/, m => 'condizione del guasto "' + m[1] + '" non valutabile: ' + m[2]);
P(/^fault condition "(.+)" is not a boolean$/, m => 'condizione del guasto "' + m[1] + '" non è booleana'); M('Random faults', 'Guasti casuali');
M('How many, as in crash:1, or how often, as in crash:0.5/s: kinds are crash, recover, pause, partition, link, omission, zone',
  'Quanti, come crash:1, oppure con che frequenza, come crash:0.5/s: i tipi sono crash, recover, pause, partition, link, omission, zone');
M('Faults drawn from the seed of each run: a number, as in crash:1, or a rate, as in crash:0.5/s',
  'Guasti estratti dal seme di ogni esecuzione: un numero, come crash:1, o un tasso, come crash:0.5/s'); M('Random faults to draw', 'Guasti casuali da estrarre');
M('When the random faults happen', 'Quando avvengono i guasti casuali');
M('What to draw: crash:1, partition:1, pause:1, link:1, omission:1, recover:1', 'Cosa estrarre: crash:1, partition:1, pause:1, link:1, omission:1, recover:1');
M('Draw', 'Estrai'); M('Redraw', 'Riestrai');
M('Draw a schedule and add it to the scenario', 'Estrai uno schedule e aggiungilo allo scenario');
M('Replace the faults of the scenario with a new draw', 'Sostituisci i guasti dello scenario con una nuova estrazione');
M('Nothing could be drawn for this topology.', 'Non è stato possibile estrarre nulla per questa topologia.');
P(/^Faults drawn: (.+)\.$/, m => 'Guasti estratti: ' + m[1] + '.');
P(/^Faults replaced: (.+)\.$/, m => 'Guasti sostituiti: ' + m[1] + '.'); M('Faults per run', 'Guasti per esecuzione'); M('Generated faults per run', 'Guasti generati per esecuzione');
M('Window', 'Finestra'); M('When the generated faults happen', 'Quando avvengono i guasti generati');
M('Faults drawn from the seed of each run: crash:1, partition:1, pause:1, link:1, omission:1, recover:1',
  'Guasti estratti dal seme di ogni esecuzione: crash:1, partition:1, pause:1, link:1, omission:1, recover:1');
M('none', 'nessuno'); M('minimize', 'riduci'); M('shrinking…', 'riduzione…');
M('Find the faults that are enough to produce this failure', 'Trova i guasti che bastano a produrre questo problema');
M('This run could not be shrunk.', 'Questa esecuzione non si è potuta ridurre.');
P(/^(\d+) faults reduced to (\d+) in (\d+) runs\.$/, m => m[1] + ' guasti ridotti a ' + m[2] + ' in ' + m[3] + ' esecuzioni.'); M('Open this run', 'Apri questa esecuzione');
M('Open this run, with its generated faults', 'Apri questa esecuzione, con i suoi guasti generati');
P(/^Added the faults of seed (\d+) to the scenario\.$/, m => 'Aggiunti allo scenario i guasti del seme ' + m[1] + '.'); M('Run over seeds', 'Esegui sui semi'); M('Seeds to run', 'Semi da eseguire'); M('Stop', 'Ferma');
M('Open this run', 'Apri questa esecuzione'); M('stopped', 'fermato'); M('all clean', 'tutto a posto');
M('Seeds look like 1..50, or 3, or 1,4,9.', 'I semi si scrivono come 1..50, oppure 3, oppure 1,4,9.');
M('That is a lot of seeds: try at most 500.', 'Sono molti semi: al massimo 500.');
P(/^(\d+) \/ (\d+)$/, m => null);
P(/^(\d+) of (\d+) run\(s\), $/, m => m[1] + ' di ' + m[2] + ' esecuzioni, ');
P(/^(\d+) with a problem$/, m => m[1] + ' con un problema');
P(/^(\d+) run\(s\) in ([\d.]+) s$/, m => m[1] + ' esecuzioni in ' + m[2] + ' s');
P(/^ \((always|eventually)\) held in (\d+)\/(\d+) run\(s\)(, first broken at seed (\d+))?$/, m =>
  ' (' + (m[1] === 'always' ? 'sempre' : 'prima o poi') + ') vale in ' + m[2] + '/' + m[3] + ' esecuzioni' + (m[5] ? ', prima rottura al seme ' + m[5] : ''));
P(/^seed (\d+)$/, m => 'seme ' + m[1]);
P(/^ (\w+(?:, \w+)*) broken$/, m => ' ' + m[1] + ' violata');
P(/^ (\d+) violation\(s\)$/, m => ' ' + m[1] + ' violazioni');
P(/^ (\d+) failed assertion\(s\)$/, m => ' ' + m[1] + ' asserzioni violate');
P(/^  (\d+) messages, (\d+) outputs$/, m => '  ' + m[1] + ' messaggi, ' + m[2] + ' output');
P(/^showing the first 60 of (\d+)\.$/, m => 'mostrate le prime 60 di ' + m[1] + '.');
M('Process pause', 'Pausa di processo'); M('Omission', 'Omissione'); M('One way', 'Unidirezionale');
M('Only the messages from the first process to the second are lost', 'Si perdono solo i messaggi dal primo processo al secondo');
M('Omits', 'Omette'); M('sends and receives', 'invii e ricezioni'); M('sends', 'invii'); M('receives', 'ricezioni');
M('Probability', 'Probabilità'); M('Omission probability', 'Probabilità di omissione'); M('End of the pause', 'Fine della pausa');
M('Pause here', 'Pausa qui'); M('Stop processing for that long, without losing anything', 'Smetti di elaborare per quel tempo, senza perdere nulla');
M('omitted by a process', 'omesso da un processo');
P(/^(p\d+) pauses: it handles nothing until (.+)$/, m => m[1] + ' va in pausa: non elabora nulla fino a ' + m[2]);
P(/^(p\d+) resumes$/, m => m[1] + ' riprende');
P(/^link down (p\d+) → (p\d+)$/, m => 'collegamento interrotto ' + m[1] + ' → ' + m[2]);
P(/^(p\d+) pauses at (.+)\.$/, m => m[1] + ' va in pausa a ' + m[2] + '.');
P(/^paused until (.+)$/, m => 'in pausa fino a ' + m[1]);
P(/^(p\d+) paused from (\S+) until (\S+)$/, m => m[1] + ' in pausa da ' + m[2] + ' fino a ' + m[3]);
P(/^one-way link (p\d+) → (p\d+) down from (\S+)(?: until (\S+)| onwards)$/, m => 'collegamento unidirezionale ' + m[1] + ' → ' + m[2] + ' interrotto da ' + m[3] + (m[4] ? ' fino a ' + m[4] : ' in poi'));
P(/^(p\d+) omits (all|\d+% of) its (sends and receives|sends|receives) from (\S+)(?: until (\S+)| onwards)$/, m =>
  m[1] + ' omette ' + (m[2] === 'all' ? 'tutti i' : 'il ' + m[2].replace('% of', '% dei')) + ' suoi ' +
  ({ 'sends and receives': 'invii e ricezioni', sends: 'invii', receives: 'ricezioni' })[m[3]] + ' da ' + m[4] + (m[5] ? ' fino a ' + m[5] : ' in poi'));
P(/^message to (p\d+) not sent \(omission\)$/, m => 'messaggio per ' + m[1] + ' non inviato (omissione)');
P(/^message from (p\d+) not received \(omission\)$/, m => 'messaggio da ' + m[1] + ' non ricevuto (omissione)');
M('Properties', 'Proprietà');
P(/^(\d+)\/(\d+) properties$/, m => m[1] + '/' + m[2] + ' proprietà');
P(/^(\w+) is violated$/, m => m[1] + ' violata');
P(/^(\w+) holds from here$/, m => m[1] + ' vale da qui');
P(/^(\w+) could not be evaluated: (.+)$/, m => m[1] + ' non valutabile: ' + m[2]);
M('property', 'proprietà');
P(/^Invalid duration: "(.*)" \(examples: (.*)\)$/, m => 'Durata non valida: "' + m[1] + '" (esempi: ' + m[2] + ')');
P(/^Unknown distribution: (\w+) \(available: (.*)\)$/, m => 'Distribuzione sconosciuta: ' + m[1] + ' (disponibili: ' + m[2] + ')');
P(/^(\w+) takes (\d+) argument\(s\)$/, m => m[1] + ' richiede ' + m[2] + ' argomenti');
P(/^Input line (\d+): (.+)$/, m => 'Riga di input ' + m[1] + ': ' + (tr(m[2]) || m[2]));
P(/^Fault (\d*): (.+)$/, m => 'Guasto ' + m[1] + ': ' + (tr(m[2]) || m[2]));

// ---------------------------------------------------------------- blocks with markup
BLOCKS.guide = `<p>Un programma contiene <b>interfacce</b> e <b>algoritmi</b>. Un algoritmo implementa un'interfaccia e ne usa altre: <code>Net</code> (la rete) e <code>Rounds</code> (i round sincroni) sono forniti dal simulatore; le altre le scrivi tu, e vengono collegate automaticamente.</p>
<pre>upon event ⟨instance, Event | pattern⟩ where condition do … end
upon condition expression do … end
upon exists x in S where condition do … end
trigger ⟨instance, Event | arg1, arg2⟩
forall q in neighbors where q ≠ p do … end
if … then … elif … then … else … end
starttimer(t, 100ms)   canceltimer(t)
⟨timer, Timeout | t⟩   assert cond, "msg"   log x</pre>
<pre>function name(a, b) … return value … end      call name(x, y)
uses PerfectLinks as pl via AckLinks</pre>
<p>Le funzioni stanno dentro un algoritmo, ne vedono stato e parametri e possono generare eventi; si usano nelle espressioni o, come istruzione, con <code>call</code>. <code>via</code> sceglie quale algoritmo implementa un'interfaccia usata quando ce ne sono più di uno.</p>
<p>Le indication salgono, le request scendono. Le parole tutte maiuscole non dichiarate (<code>HEARTBEAT</code>) sono atomi. Nei pattern un nome nuovo cattura il valore; un atomo o un nome già noto deve coincidere.</p>
<p>Predefiniti: <code>self</code>, <code>Π</code>, <code>N</code>, <code>neighbors</code>, <code>round</code>, <code>now()</code>, <code>DELTA</code> <code>PHI</code> <code>RHO</code> (solo se noti nel modello assunto), <code>min max choose size keys values map() get(m,k,default) remove(c,x) random(a,b) pick(S) append head tail last sort reverse slice range sum mean argmin argmax toset str abs sqrt ln exp pow floor ceil round</code>. Le tuple partono da 0; <code>#S</code> è la cardinalità. Le durate (<code>50ms</code>) sono numeri in microsecondi.</p>
<p>Equivalenti ASCII: <code>&lt; &gt;</code> per ⟨ ⟩, <code>union inter minus in notin subseteq</code>, <code>!= &lt;= &gt;=</code>, <code>and or not</code>, <code>Procs</code> per Π, <code>{}</code> per ∅. Dentro un <code>trigger</code> in ASCII, metti i confronti tra parentesi.</p>`;
BLOCKS['hint-unknown'] = 'Scrivi <code>unknown</code> per un limite che esiste ma che l\'algoritmo non conosce. DELTA: ritardo massimo; PHI: durata massima di un passo; RHO: deriva massima dei clock.';
BLOCKS['hint-dist'] = 'Distribuzioni: <code>const(d)</code> <code>uniform(a, b)</code> <code>exp(media)</code> <code>normal(μ, σ)</code> <code>lognormal(μ, σ)</code> (μ, σ in log ms) <code>pareto(xm, α)</code> <code>empirical(a, b, …)</code>. I numeri senza unità sono ms. I messaggi inviati prima di GST arrivano comunque entro GST + limite.';
BLOCKS['hint-inputs'] = 'Un evento per riga: <code>TEMPO NODO Evento | argomenti</code>, dove <code>*</code> indica tutti i processi. Esempi: <code>0ms 1 Broadcast | "ciao"</code>, <code>0ms * Propose | random(1, 9)</code>. Gli eventi devono essere request dell\'algoritmo principale. Durante la riproduzione puoi anche selezionare un processo e iniettare un evento all\'istante corrente.';
BLOCKS['hint-faults'] = 'I processi non elencati in una partizione formano un gruppo a parte, quindi <code>3</code> da solo isola p3. Lascia vuoto <em>Fino a</em> per un guasto permanente. Un processo che riparte ha lo stato volatile azzerato: le variabili dichiarate <code>stable</code> conservano il valore, e ogni modulo riceve <code>Recovery</code> se lo gestisce, <code>Init</code> altrimenti. Durante la riproduzione puoi anche selezionare un processo o un collegamento e iniettare crash, ripartenze, isolamenti o guasti all\'istante corrente.';

// ---------------------------------------------------------------- engine
const cache = new Map();
function tr(s) {
  if (s === undefined || s === null) return s;
  if (Object.prototype.hasOwnProperty.call(IT, s)) return IT[s];
  if (cache.has(s)) return cache.get(s);
  let out = null;
  for (const [re, fn] of PAT) {
    const m = re.exec(s);
    if (!m) continue;
    const r = fn(m);
    if (r !== null && r !== undefined) { out = r; break; }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(s, out);
  return out;
}

let lang = 'en';
let observer = null;
const SKIP = '#code, #code-hl, #gutter, textarea, script, style, .log .t, .log .n, .insp td, .insp h4.path, .recent, code, kbd, pre, #tlabel, .nd, .pk, .payload, [data-i18n-block], .flow-label';
const ATTRS = ['title', 'placeholder', 'aria-label'];

function translateText(node) {
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return;
  const raw = node.nodeValue;
  const s = raw.trim();
  if (!s || !/[A-Za-z]/.test(s)) return;
  if (node.__it === raw) return;
  const t = tr(s);
  if (t === null || t === undefined || t === s) return;
  const lead = raw.slice(0, raw.indexOf(s)), tail = raw.slice(raw.indexOf(s) + s.length);
  node.__en = raw;
  node.__it = lead + t + tail;
  node.nodeValue = node.__it;
}
function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute && el.getAttribute(a);
    if (!v) continue;
    el.__it = el.__it || {};
    if (el.__it[a] === v) continue;
    const t = tr(v);
    if (t === null || t === undefined || t === v) continue;
    el.__en = el.__en || {};
    el.__en[a] = v;
    el.__it[a] = t;
    el.setAttribute(a, t);
  }
}
function translateTree(rootEl) {
  if (rootEl.nodeType === 3) { translateText(rootEl); return; }
  if (rootEl.nodeType !== 1) return;
  translateAttrs(rootEl);
  const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) translateText(n);
    else translateAttrs(n);
  }
}
function restoreTree() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) {
      if (n.__en !== undefined && n.nodeValue === n.__it) n.nodeValue = n.__en;
      n.__it = undefined;
    } else if (n.__en) {
      for (const a in n.__en) if (n.getAttribute(a) === n.__it[a]) n.setAttribute(a, n.__en[a]);
      n.__en = undefined; n.__it = undefined;
    }
  }
}
// Blocks with markup: the English content is kept as cloned nodes, the translations are constant markup
// parsed once into a template.
const parsedBlocks = {};
function blockNodes(k) {
  if (!parsedBlocks[k]) {
    const tpl = document.createElement('template');
    tpl.innerHTML = BLOCKS[k];
    parsedBlocks[k] = tpl.content;
  }
  return parsedBlocks[k].cloneNode(true);
}
function applyBlocks(to) {
  for (const el of document.querySelectorAll('[data-i18n-block]')) {
    const k = el.getAttribute('data-i18n-block');
    if (el.__enNodes === undefined) el.__enNodes = [...el.childNodes].map(n => n.cloneNode(true));
    if (to === 'it' && Object.prototype.hasOwnProperty.call(BLOCKS, k)) el.replaceChildren(blockNodes(k));
    else el.replaceChildren(...el.__enNodes.map(n => n.cloneNode(true)));
  }
}
function setLang(l) {
  l = l === 'it' ? 'it' : 'en';
  if (l === lang) { if (l === 'it') translateTree(document.body); return; }
  lang = l;
  applyBlocks(l);
  if (l === 'it') {
    translateTree(document.body);
    if (!observer) {
      observer = new MutationObserver(list => {
        if (lang !== 'it') return;
        for (const m of list) {
          if (m.type === 'childList') m.addedNodes.forEach(translateTree);
          else if (m.type === 'characterData') translateText(m.target);
          else if (m.type === 'attributes') translateAttrs(m.target);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
  } else {
    restoreTree();
  }
}
function t(s) { if (lang !== 'it') return s; const r = tr(s); return r === null || r === undefined ? s : r; }

root.SimI18n = { setLang, t, lang: () => lang, _tr: tr, _blocks: () => Object.keys(BLOCKS) };
})(typeof self !== 'undefined' ? self : this);
