/* Mesure d'audience de l'épisode — GoatCounter.
   Pourquoi celui-ci : gratuit, libre, sans cookie et sans donnée personnelle.
   Rien à déclarer, aucun bandeau de consentement à afficher (la CNIL exempte
   les mesures d'audience strictement anonymes).

   Le compte est celui du portail : tous les épisodes vivent sur petit-labo.fr,
   donc un seul compte les couvre et chacun apparaît comme un chemin distinct
   (/ou-va-le-soleil/, /la-lune-change-de-forme/…). C'est ce qui permet de voir
   quel épisode marche — beaucoup de parents arrivent ici par un lien partagé
   sans passer par la page d'accueil.

   Ce fichier est une copie de celui du portail, pas un lien vers lui : chaque
   épisode doit rester ouvrable seul avec `python3 -m http.server`, ce qu'un
   chemin absolu vers /js/ du portail casserait.

   CODE est le nom du compte GoatCounter : les statistiques se lisent sur
   <code>.goatcounter.com. Le vider suffit à tout couper — le fichier ne charge
   alors plus rien, aucune requête vers un tiers, aucune trace.

   Les JALONS d'engagement : en plus de la page vue, l'épisode signale deux
   moments à GoatCounter, comptés comme des événements (chemin
   ev/<épisode>/<jalon>, une fois par session et par chemin, comme une page) :
   « audio », l'enfant a lancé le conteur ; « fin », il est allé au bout de
   l'épisode (le sens exact est propre à chaque épisode : voir l'appel dans
   main.js). Rapportés aux ouvertures de la page,
   ils disent si l'épisode est vécu ou seulement ouvert. Un jalon est un fait
   sur la page, jamais une mesure sur la personne : aucune durée, aucune
   valeur individuelle, rien d'écrit chez le visiteur. main.js appelle
   window.jalon('audio') et window.jalon('fin') ; sans compte, hors ligne ou
   avant l'arrivée de count.js, l'appel ne fait rien.

   Compat mobiles anciens : pas d'optional chaining ni de nullish. */
(function () {
  'use strict';

  var CODE = 'davidb-prog';

  window.jalon = function () {}; // remplacé plus bas si la mesure est active

  if (!CODE) { return; }

  /* GoatCounter ignore déjà localhost ; on écarte aussi les ouvertures
     depuis le système de fichiers (file://) pendant le développement. */
  if (window.location.protocol === 'file:') { return; }

  var s = document.createElement('script');
  s.src = 'https://gc.zgo.at/count.js';
  s.async = true;
  s.setAttribute('data-goatcounter', 'https://' + CODE + '.goatcounter.com/count');
  document.head.appendChild(s);

  var envoyes = {};
  window.jalon = function (nom) {
    if (envoyes[nom]) { return; }
    var gc = window.goatcounter;
    if (!gc || typeof gc.count !== 'function') { return; } // count.js pas encore là
    envoyes[nom] = true;
    var episode = window.location.pathname.split('/')[1] || 'episode';
    gc.count({ path: 'ev/' + episode + '/' + nom, title: 'Jalon ' + nom, event: true });
  };
})();
