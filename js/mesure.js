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

   Compat mobiles anciens : pas d'optional chaining ni de nullish. */
(function () {
  'use strict';

  var CODE = 'davidb-prog';

  if (!CODE) { return; }

  /* GoatCounter ignore déjà localhost ; on écarte aussi les ouvertures
     depuis le système de fichiers (file://) pendant le développement. */
  if (window.location.protocol === 'file:') { return; }

  var s = document.createElement('script');
  s.src = 'https://gc.zgo.at/count.js';
  s.async = true;
  s.setAttribute('data-goatcounter', 'https://' + CODE + '.goatcounter.com/count');
  document.head.appendChild(s);
})();
