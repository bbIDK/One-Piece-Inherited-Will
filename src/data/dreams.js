// Every character sails for a dream. Fulfilling it makes you a legend and
// pays a huge amount of Inherited Will to your successors.
export const DREAMS = {
  king: {
    name: 'King of the Pirates', icon: '👑',
    desc: 'Find the One Piece on Laugh Tale, the final island of the Grand Line.',
    goal: 'Collect the four Road Poneglyph rubbings and set foot on Laugh Tale.',
    perk: 'Your bounty grows 15% faster.',
    faction: 'pirate',
  },
  swordsman: {
    name: "World's Greatest Swordsman", icon: '⚔',
    desc: 'Surpass "Hawk-Eyes" Dracule Mihawk, the strongest swordsman alive.',
    goal: 'Defeat Dracule Mihawk in a duel.',
    perk: 'Sword styles gain mastery 20% faster. You start with a rusty katana.',
  },
  all_blue: {
    name: 'Find the All Blue', icon: '🐟',
    desc: 'Find the legendary sea where the fish of all four Blues meet.',
    goal: 'Discover the All Blue.',
    perk: 'Food heals 50% more.',
  },
  world_map: {
    name: 'Draw a Map of the World', icon: '🗺',
    desc: 'Chart every island of the Blue Planet with your own eyes.',
    goal: 'Discover 60 charted islands.',
    perk: 'You see further at sea and sense storms coming.',
  },
  warrior: {
    name: 'Brave Warrior of the Sea', icon: '🛡',
    desc: 'Become a warrior as brave as the giants of Elbaf.',
    goal: 'Defeat 12 bosses.',
    perk: '+2 Willpower. Breakthroughs grant +1 extra point.',
  },
  admiral: {
    name: 'Admiral of Justice', icon: '⚓',
    desc: 'Join the Marines and rise to the rank of Admiral.',
    goal: 'Reach the rank of Admiral in the Marines.',
    perk: 'Marines start friendly. You can enlist at any Marine base.',
    faction: 'marine',
  },
  true_history: {
    name: 'Uncover the True History', icon: '📜',
    desc: 'Read the Poneglyphs and learn what happened in the Void Century.',
    goal: 'Read 8 Poneglyphs.',
    perk: 'You can study Poneglyphs even without the Voice of All Things.',
  },
  liberation: {
    name: 'Free the Oppressed', icon: '✊',
    desc: 'Topple the tyrants of the seas, like the Revolutionary Army.',
    goal: 'Liberate 6 islands from tyrants (Arlong, Crocodile, Enel, Moria, Doflamingo, Kaido...).',
    perk: 'Liberated islands sell to you at half price.',
  },
};
export const DREAM_IDS = Object.keys(DREAMS);
