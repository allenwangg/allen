/* Prism — course content.
   Authored and fact-checked content; structure validated by validate.mjs. */
window.COURSES = [
  {
    "id": "cognitive-biases",
    "title": "Cognitive Biases",
    "tagline": "Your brain cuts corners. Learn to catch it in the act.",
    "category": "Psychology",
    "description": "The classic experiments behind your everyday mistakes — rigged wheels, loaded dice, and million-dollar putts. Learn the four biases that warp your judgment most, and the specific questions that catch each one before it costs you.",
    "lessons": [
      {
        "id": "anchoring-framing",
        "title": "Anchors and Frames",
        "summary": "How arbitrary numbers and word choices quietly steer estimates and decisions — from rigged wheels to courtroom sentences.",
        "cards": [
          {
            "type": "intro",
            "title": "The Rigged Wheel",
            "body": "In 1974, Amos Tversky and Daniel Kahneman spun a rigged wheel of fortune — it could only stop at 10 or 65 — then asked people to estimate the percentage of African countries in the UN. The wheel was obviously random. It didn't matter: the median guess after seeing 10 was 25%; after 65, it was 45%. A meaningless number had steered their judgment.",
            "art": "orbit"
          },
          {
            "type": "concept",
            "title": "Anchoring: First Number Wins",
            "body": "An anchor is any number that enters your head before you estimate. You start there and adjust — but adjustment almost always stops short, so the final answer stays tilted toward the anchor. It works on list prices, salary offers, and damage awards, and it works even when you know the number is irrelevant.",
            "art": "anchor"
          },
          {
            "type": "reveal",
            "prompt": "Was Gandhi older or younger than 140 when he died? Silly question — but now take a guess at his actual age.",
            "answer": "He died at 78. In Fritz Strack and Thomas Mussweiler's 1997 studies, people asked the '140' version guessed far higher than those anchored at 9. Even absurd, obviously wrong anchors drag estimates toward them."
          },
          {
            "type": "example",
            "title": "Judges Rolling Dice",
            "body": "In 2006, Birte Englich, Thomas Mussweiler, and Fritz Strack had German judges roll dice — rigged to land on 3 or 9 — as a stand-in for a prosecutor's sentencing demand. Judges who rolled 9 gave a shoplifter around eight months; judges who rolled 3 gave around five. Years of legal training, anchored by dice.",
            "art": "balance"
          },
          {
            "type": "mcq",
            "prompt": "You're negotiating a salary. Based on anchoring research, what's the strongest opening move?",
            "choices": [
              "Name an ambitious number first, and set the anchor",
              "Let them go first, so you can adjust from their offer",
              "Refuse to discuss numbers until the very end",
              "It doesn't matter — professionals aren't anchored"
            ],
            "answer": 0,
            "explain": "The first number tilts the whole negotiation toward itself, and adjustment away from it reliably stops short. Expertise is no vaccine — the dice-rolling judges proved that."
          },
          {
            "type": "concept",
            "title": "Why Anchors Stick",
            "body": "Anchors don't just start your math; they steer your memory. While testing whether 65 could be right, your brain retrieves evidence compatible with 65 — psychologists call it selective accessibility. The anchor recruits its own supporting facts, which is why merely knowing about anchoring doesn't switch it off.",
            "art": "brain"
          },
          {
            "type": "concept",
            "title": "Framing: Same Facts, New Wrapper",
            "body": "In 1988, Irwin Levin and Gary Gaeth had people taste ground beef labeled either '75% lean' or '25% fat.' Identical meat. The 'lean' group rated it better tasting and less greasy. A frame changes nothing about the facts — only which feature your mind chews on first.",
            "art": "lens"
          },
          {
            "type": "example",
            "title": "600 Lives, Two Frames",
            "body": "Tversky and Kahneman, 1981: a disease threatens 600 people. Framed as gains — 'Program A saves 200' versus a one-in-three chance to save all 600 — 72% took the sure thing. Framed as losses — '400 will die' versus the same gamble — most flipped to the risky option. Same numbers, opposite choices. We play it safe with gains and gamble to dodge losses.",
            "art": "fork"
          },
          {
            "type": "truefalse",
            "statement": "Framing tricks fade when the stakes are high and the decision-makers are experts.",
            "answer": false,
            "explain": "When Barbara McNeil, Tversky, and colleagues described lung-cancer surgery to physicians, preference for surgery was 84% under a '90% survival' frame but only 50% under the identical '10% mortality' frame. Experts with real stakes flipped like everyone else."
          },
          {
            "type": "quote",
            "text": "My colleagues, they study artificial intelligence; me, I study natural stupidity.",
            "by": "Amos Tversky"
          },
          {
            "type": "concept",
            "title": "Consider the Opposite",
            "body": "The tested antidote: argue against the number in front of you. Mussweiler, Strack, and Pfeiffer found in 2000 that listing reasons an anchor is wrong measurably weakens its pull. In practice: before accepting any first offer, price, or projection, force yourself to name two ways it could be too high or too low.",
            "art": "shield"
          },
          {
            "type": "reveal",
            "prompt": "A price tag reads 'Was $199 — now $79.' What is the $199 actually doing?",
            "answer": "It's an anchor. You're no longer judging whether the item is worth $79 — you're enjoying a $120 'gain.' Cover the old price and ask what you'd pay cold. Retailers count on you not doing that."
          },
          {
            "type": "recap",
            "title": "Anchors and Frames",
            "points": [
              "Anchoring: estimates get pulled toward the first number in mind, and adjusting away from it stops short — even when the anchor is random.",
              "Experts aren't immune: judges' sentences tracked rigged dice; physicians' choices tracked survival vs. mortality wording.",
              "Framing: identical facts choose differently as gains ('saves 200') vs. losses ('400 die') — we're cautious with gains, risk-taking with losses.",
              "Defenses: name your number first, list reasons any given number is wrong, and flip every statistic into its mirror frame before deciding."
            ]
          }
        ],
        "review": [
          {
            "front": "What is anchoring?",
            "back": "Estimates get pulled toward the first number in mind — even an irrelevant one — because adjustment away from it reliably stops short."
          },
          {
            "front": "In Tversky and Kahneman's 1974 wheel study, what changed people's UN estimates?",
            "back": "A rigged wheel stopping at 10 vs. 65: those groups then guessed 25% vs. 45% of African countries in the UN. A random number steered judgment."
          },
          {
            "front": "What is the framing effect?",
            "back": "The same facts choose differently by wrapper: people took a sure gain ('saves 200') but gambled to avoid the same outcome stated as a loss ('400 die')."
          },
          {
            "front": "What's a proven way to weaken an anchor?",
            "back": "Consider the opposite: list reasons the number could be wrong (Mussweiler et al., 2000) — or set the anchor yourself by going first."
          }
        ]
      },
      {
        "id": "confirmation-bias",
        "title": "The Evidence You Go Looking For",
        "summary": "Why we hunt for evidence that agrees with us, and how to test beliefs the way Wason and Darwin would.",
        "cards": [
          {
            "type": "intro",
            "title": "The 2-4-6 Trap",
            "body": "In 1960, Peter Wason showed people the triple 2-4-6 and asked them to find his rule by proposing triples, getting a yes or no for each. Most tested 8-10-12, 20-22-24 — confirmations of a guess like 'rising by two.' The real rule: any increasing numbers. People announced wrong rules with full confidence, having only asked questions their theory would pass.",
            "art": "puzzle"
          },
          {
            "type": "concept",
            "title": "Confirmation Bias",
            "body": "We search for, interpret, and remember evidence that fits what we already believe — and quietly under-sample everything that could prove us wrong. Raymond Nickerson's 1998 review called the bias ubiquitous, a top candidate for the most problematic aspect of human reasoning. The distortion isn't in how you argue; it's in where you point the flashlight.",
            "art": "lens"
          },
          {
            "type": "reveal",
            "prompt": "Four cards show E, K, 4, 7. Rule to test: if a card has a vowel on one side, it has an even number on the other. Which cards must you flip?",
            "answer": "E and 7. The 4 can't break the rule — it says nothing about what sits behind even numbers. In Wason's selection task, fewer than 10% chose correctly; most flipped E and 4, seeking confirmation."
          },
          {
            "type": "concept",
            "title": "Test to Break, Not to Bless",
            "body": "The 7 matters because only it can falsify: a vowel behind it kills the rule. The 4 can only flatter it. Wason's point echoes Karl Popper — a theory earns its keep by surviving attempts to destroy it. A hundred confirmations tell you less than one honest attempt at disproof.",
            "art": "eye"
          },
          {
            "type": "example",
            "title": "The Bouncer Version",
            "body": "Same logic, different costume: 'If someone's drinking beer, they must be over 19' — the legal age where the study ran. Who do you check: the beer drinker, the cola drinker, the 22-year-old, the 16-year-old? In Richard Griggs and James Cox's 1982 studies, about 75% got it right — the beer and the 16-year-old. Our logic works fine when the task looks like catching a cheater.",
            "art": "key"
          },
          {
            "type": "mcq",
            "prompt": "You suspect Wason's rule is 'even numbers rising by two.' Which triple is the most informative test?",
            "choices": [
              "8-10-12",
              "1-2-3",
              "100-102-104",
              "2-4-6 again"
            ],
            "answer": 1,
            "explain": "1-2-3 breaks your hypothesis, so a 'yes' would disprove it on the spot — which is exactly what happens, since the real rule is any increasing numbers. The other triples can only tell you what you expect to hear."
          },
          {
            "type": "concept",
            "title": "Motivated Reasoning",
            "body": "Confirmation bias has a heat-seeking cousin. When we like a conclusion, we ask 'Can I believe this?' and hunt for permission; when we hate one, we ask 'Must I believe this?' and hunt for an exit — Thomas Gilovich's summary of how the bar moves. Ziva Kunda's 1990 work showed we reason toward preferred conclusions while feeling perfectly objective.",
            "art": "flame"
          },
          {
            "type": "example",
            "title": "Same Studies, Deeper Trenches",
            "body": "In 1979, Charles Lord, Lee Ross, and Mark Lepper showed death-penalty supporters and opponents the same two mixed studies — one suggesting deterrence, one not. Each side rated the study they agreed with as better science, and both sides left more convinced than they arrived. Identical evidence, wider divide.",
            "art": "balance"
          },
          {
            "type": "truefalse",
            "statement": "Showing partisans the same mixed evidence tends to pull their views closer together.",
            "answer": false,
            "explain": "Lord, Ross, and Lepper found the opposite: each side counted the congenial study as strong and picked the other apart, so both left more extreme. Evidence gets filtered before it gets weighed."
          },
          {
            "type": "quote",
            "text": "The human understanding when it has once adopted an opinion draws all things else to support and agree with it.",
            "by": "Francis Bacon"
          },
          {
            "type": "example",
            "title": "Darwin's Golden Rule",
            "body": "Charles Darwin kept a private rule: whenever he met a fact that contradicted his theory, he wrote it down at once — because, he explained in his autobiography, such facts 'were far more apt to escape from the memory than favourable ones.' He didn't trust his own recall to store the other side of the argument.",
            "art": "book"
          },
          {
            "type": "reveal",
            "prompt": "Before you go looking for evidence on something you already believe, what should you write down first?",
            "answer": "What would change your mind. Name the observation that would count against you, then go look for that. If nothing could change your mind, you're not investigating — you're decorating a conclusion."
          },
          {
            "type": "recap",
            "title": "The Evidence You Go Looking For",
            "points": [
              "Confirmation bias: we sample the world where our beliefs are safest — the flashlight, not the logic, is what's broken.",
              "Wason's tasks: under 10% flip the falsifying card, yet about 75% solve the identical logic as a cheater-catching problem.",
              "Motivated reasoning moves the bar — 'Can I believe?' for friendly conclusions, 'Must I believe?' for hostile ones — and mixed evidence polarizes (Lord, Ross & Lepper, 1979).",
              "The fix is Darwin's: decide in advance what would change your mind, and record unwelcome facts before they slip away."
            ]
          }
        ],
        "review": [
          {
            "front": "What did Wason's 2-4-6 task show?",
            "back": "People test triples that fit their hypothesis and rarely try ones that would break it — so they confirm wrong rules with confidence."
          },
          {
            "front": "In the E, K, 4, 7 card task, which cards test 'vowel means even number on the back'?",
            "back": "E and 7 — only they can falsify the rule. Fewer than 10% get it right, but about 75% solve the beer-and-drinking-age version of the same logic."
          },
          {
            "front": "What is motivated reasoning?",
            "back": "Moving the evidential bar by desire: 'Can I believe this?' for liked conclusions, 'Must I believe this?' for disliked ones (Kunda, 1990)."
          },
          {
            "front": "What happened when partisans saw the same mixed death-penalty evidence?",
            "back": "Both sides rated the agreeable study as stronger science and became more polarized (Lord, Ross & Lepper, 1979)."
          }
        ]
      },
      {
        "id": "availability-negativity",
        "title": "The Availability Trap",
        "summary": "Why vivid, recent, and scary events feel more likely than they are — and how media coverage bends your risk map.",
        "cards": [
          {
            "type": "intro",
            "title": "The Letter K Test",
            "body": "Quick: does English have more words that start with K, or more with K as the third letter? Most people in Tversky and Kahneman's 1973 study said first letter. In typical text, words with K third are about twice as common — 'ask,' 'like,' 'make.' First-letter words leap to mind; third-letter words barely surface. Your answer tracked the leaping, not the language.",
            "art": "wave"
          },
          {
            "type": "concept",
            "title": "The Availability Heuristic",
            "body": "When frequency is hard to count, your brain substitutes an easier question: how readily do examples come to mind? Tversky and Kahneman named this the availability heuristic in 1973. It's usually a decent proxy — common things do come to mind easily. But anything that makes memories vivid, recent, or dramatic counterfeits the signal.",
            "art": "brain"
          },
          {
            "type": "mcq",
            "prompt": "Why do most people guess K is more common as a first letter?",
            "choices": [
              "It actually is more common — the study tricked people",
              "Retrieving words by first letter is easy, and ease gets mistaken for frequency",
              "K is a rare letter, so people overcorrect upward",
              "English spelling rules favor K at the start of words"
            ],
            "answer": 1,
            "explain": "Memory is indexed by initial sounds, so 'kite' and 'king' arrive instantly while 'ask' and 'bake' stay hidden. The heuristic reads ease of arrival as evidence of frequency — and here that reading is wrong."
          },
          {
            "type": "example",
            "title": "Tornadoes vs. Asthma",
            "body": "In 1978, Sarah Lichtenstein, Paul Slovic, and colleagues asked people to compare causes of death. Tornadoes were judged deadlier than asthma, though asthma then killed about 20 times more Americans. The pattern held broadly: dramatic, reportable deaths were overestimated; quiet, common ones underestimated.",
            "art": "graph"
          },
          {
            "type": "concept",
            "title": "If It Bleeds, It Leads",
            "body": "News is an availability machine. A 1979 follow-up by Barbara Combs and Paul Slovic found newspapers covered violent, spectacular deaths far out of proportion to their actual rates — and people's frequency errors mirrored the coverage. Editors select for drama; your memory then serves it back to you as probability.",
            "art": "dialog"
          },
          {
            "type": "example",
            "title": "The 9/11 Detour",
            "body": "After September 2001, millions of Americans avoided planes and drove instead. Risk researcher Gerd Gigerenzer estimated the shift produced roughly 1,500 additional road deaths over the following year — several times the number of passengers killed on the hijacked flights. Fleeing a vivid risk pushed people into a larger, duller one.",
            "art": "path"
          },
          {
            "type": "truefalse",
            "statement": "A plane crash feels more likely than the statistics say partly because every crash is covered and no safe landing ever is.",
            "answer": true,
            "explain": "Availability runs on retrieval, and retrieval runs on exposure. When coverage tracks drama rather than frequency, your sense of risk inherits the newsroom's priorities — exactly what Combs and Slovic measured."
          },
          {
            "type": "concept",
            "title": "Bad Is Stronger Than Good",
            "body": "Availability has an accomplice. Negativity bias — documented across hundreds of studies reviewed by Roy Baumeister and colleagues in 2001 — means threats grab attention harder and stick in memory longer than good news. For our ancestors, missing a predator cost more than missing a berry. Your memory feed isn't just vivid-weighted; it's threat-weighted.",
            "art": "shield"
          },
          {
            "type": "mcq",
            "prompt": "Five glowing reviews, one furious one. What does negativity bias predict about your overall impression?",
            "choices": [
              "The math wins: five beats one",
              "The furious review dominates and lingers",
              "You'll dismiss the angry outlier as fake",
              "You'll average all six evenly"
            ],
            "answer": 1,
            "explain": "Bad is stronger than good: negative information carries more attentional weight and outlasts positive information in memory, so one vivid complaint can outvote five quiet compliments."
          },
          {
            "type": "quote",
            "text": "Nothing in life is as important as you think it is, while you are thinking about it.",
            "by": "Daniel Kahneman"
          },
          {
            "type": "concept",
            "title": "Look for the Denominator",
            "body": "The repair is arithmetic, not willpower. When a risk feels big, ask for the base rate — deaths per year, incidents per million — and notice where you learned about it. Fear that arrives through headlines is evidence about coverage. Fear that survives a denominator is evidence about the world.",
            "art": "compass"
          },
          {
            "type": "reveal",
            "prompt": "Your fear of some risk just spiked after a news story. What one question re-calibrates you?",
            "answer": "'Did I learn this from a body count or a base rate?' A story proves something happened once. Only a rate can tell you whether it's likely to happen to you."
          },
          {
            "type": "recap",
            "title": "The Availability Trap",
            "points": [
              "Availability heuristic: ease of recall stands in for frequency, so vivid, recent, dramatic events feel more common than they are.",
              "People judged tornadoes deadlier than asthma, which killed about 20 times more (Lichtenstein et al., 1978).",
              "Media amplifies the error: coverage tracks drama, and post-9/11 flight avoidance cost an estimated 1,500 extra road deaths.",
              "Negativity bias adds weight to threats — bad is stronger than good (Baumeister et al., 2001).",
              "Antidote: chase the denominator. A headline is not a base rate."
            ]
          }
        ],
        "review": [
          {
            "front": "What is the availability heuristic?",
            "back": "Judging likelihood by how easily examples come to mind — so vivid, recent, heavily covered events feel more probable than they are."
          },
          {
            "front": "Tornadoes vs. asthma: what did Lichtenstein et al. (1978) find?",
            "back": "People judged tornadoes deadlier, but asthma killed about 20 times more — dramatic deaths get overestimated, quiet ones underestimated."
          },
          {
            "front": "What did post-9/11 flight avoidance cost, per Gigerenzer's estimate?",
            "back": "Roughly 1,500 extra US road deaths in the following year — fleeing a vivid risk pushed people into a statistically larger one."
          },
          {
            "front": "What is negativity bias?",
            "back": "Bad outweighs good: threats grab attention harder and linger longer in memory (Baumeister et al., 2001), further skewing risk perception."
          }
        ]
      },
      {
        "id": "sunk-cost-loss-aversion",
        "title": "Good Money After Bad",
        "summary": "Why we throw good money after bad, and why losses hurt about twice as much as gains feel good.",
        "cards": [
          {
            "type": "intro",
            "title": "The Plane That Couldn't Stop",
            "body": "By the early 1970s, Britain and France knew Concorde would never earn back its costs — a projected £70 million budget had swollen past £1 billion. They kept building; stopping felt like wasting everything already spent. In 1976, biologists Richard Dawkins and Tamsin Carlisle named the pattern the Concorde fallacy: honoring past investment by burning more.",
            "art": "hourglass"
          },
          {
            "type": "concept",
            "title": "Sunk Costs",
            "body": "Money, time, and effort already spent are sunk: no decision can retrieve them. Rationally, only future costs and benefits should steer a choice. But Hal Arkes and Catherine Blumer showed in 1985 that people reliably let the unrecoverable past vote — continuing endeavors precisely because they've already paid for them.",
            "art": "coin"
          },
          {
            "type": "reveal",
            "prompt": "You paid $100 for a Michigan ski trip, then $50 for a Wisconsin trip you'd enjoy more. They turn out to be the same weekend, and neither is refundable. Which do you go on?",
            "answer": "Wisconsin — the $150 is gone whichever slope you stand on, so pick the better weekend. In Arkes and Blumer's 1985 study, 54% chose Michigan, protecting the bigger sunk cost at the price of a worse trip."
          },
          {
            "type": "example",
            "title": "Discounted Tickets, Empty Seats",
            "body": "Arkes and Blumer sold Ohio University theater season tickets at randomly assigned prices: full price, $2 off, or $7 off. Over the season's first half, the full-price buyers attended significantly more plays. Same shows, same seats — but the people who had paid more felt they had more to waste by staying home.",
            "art": "clock"
          },
          {
            "type": "mcq",
            "prompt": "A project is a year late and over budget. Which argument for continuing is the sunk-cost trap?",
            "choices": [
              "We've already put $2 million into this — we can't stop now",
              "The remaining work is cheap and the payoff still exceeds it",
              "Cancelling triggers contract penalties bigger than finishing",
              "The team will move faster now that the hard part is done"
            ],
            "answer": 0,
            "explain": "The $2 million is gone whether you continue or quit, so it can't justify anything. The other three cite future costs and benefits — the only things a decision can still affect."
          },
          {
            "type": "concept",
            "title": "Why Quitting Feels Like Losing",
            "body": "Walking away converts a paper loss into a certain one, and admits the earlier calls were wrong. Barry Staw's escalation-of-commitment studies, beginning in 1976, found people pour the most into a failing course of action when they personally chose it. Persistence isn't just optimism; it's how we postpone the accounting.",
            "art": "brain"
          },
          {
            "type": "concept",
            "title": "Prospect Theory",
            "body": "In 1979, Kahneman and Tversky published prospect theory, now among the most cited papers in economics. Its core: we value outcomes as gains and losses from a reference point, not as final totals — and the loss side of the curve is steeper. Losing $100 hurts roughly twice as much as winning $100 feels good.",
            "art": "graph"
          },
          {
            "type": "truefalse",
            "statement": "Most people will happily accept a coin flip where tails loses them $100 and heads wins them $110.",
            "answer": false,
            "explain": "Typical experiments find people demand a potential win of around $200 before risking a $100 loss — the roughly two-to-one exchange rate at the heart of loss aversion."
          },
          {
            "type": "example",
            "title": "Mugs and the Endowment Effect",
            "body": "Kahneman, Jack Knetsch, and Richard Thaler handed Cornell students coffee mugs in 1990, then opened a market. Sellers demanded roughly twice what buyers would pay for identical mugs. Owning something for a few minutes made parting with it register as a loss — and losses, as ever, priced at about double.",
            "art": "balance"
          },
          {
            "type": "example",
            "title": "Par Beats Birdie",
            "body": "In 2011, Devin Pope and Maurice Schweitzer analyzed 2.5 million PGA Tour putts. Pros sank par putts more often than identical-length birdie putts — missing par means losing a stroke, and losses focus the mind. The gap cost pros about one stroke per tournament in birdies left on the table.",
            "art": "target"
          },
          {
            "type": "quote",
            "text": "The concept of loss aversion is certainly the most significant contribution of psychology to behavioral economics.",
            "by": "Daniel Kahneman"
          },
          {
            "type": "reveal",
            "prompt": "One question dissolves most sunk-cost traps. What is it?",
            "answer": "'If I arrived fresh today — no history, no investment — would I choose this?' If the answer is no, the only thing holding you is the past, and no amount of future spending can refund it."
          },
          {
            "type": "recap",
            "title": "Good Money After Bad",
            "points": [
              "Sunk costs are unrecoverable; only future costs and benefits can justify continuing — yet paid-for pain keeps us going (the Concorde fallacy).",
              "Evidence: 54% chose the worse ski trip to honor the bigger price tag, and full-price ticket holders attended more plays.",
              "Prospect theory: we judge outcomes as gains and losses from a reference point, and losses weigh roughly twice as much as gains.",
              "Loss aversion runs from mug markets to the PGA Tour — pros fight harder to avoid bogey than to gain birdie.",
              "Escape hatch: ask what you'd choose if you arrived today with zero history."
            ]
          }
        ],
        "review": [
          {
            "front": "What is the sunk cost fallacy?",
            "back": "Letting unrecoverable past investment drive a decision — continuing because you've already paid, though only future costs and benefits can matter."
          },
          {
            "front": "What is loss aversion, and how strong is it?",
            "back": "In prospect theory (Kahneman & Tversky, 1979), losses loom larger than gains — losing $100 hurts about twice as much as gaining $100 pleases."
          },
          {
            "front": "What did Arkes and Blumer's ski-trip question show?",
            "back": "54% picked the $100 trip over a preferred $50 trip on the same weekend — protecting the larger sunk cost at the price of a worse experience."
          },
          {
            "front": "What question defuses a sunk-cost trap?",
            "back": "'Would I choose this today if I arrived with no history?' If no, only the unrecoverable past is holding you there."
          }
        ]
      }
    ]
  },
  {
    "id": "stoicism",
    "title": "Stoicism in Practice",
    "tagline": "The 2,000-year-old operating system for a steady mind",
    "category": "Philosophy",
    "description": "Marcus Aurelius ran an empire on it, Seneca faced exile with it, and Epictetus learned it as a slave. Four lessons turn the core Stoic practices into tools you can run this week.",
    "lessons": [
      {
        "id": "dichotomy-of-control",
        "title": "The Dichotomy of Control",
        "summary": "Epictetus's sorting rule — what is up to you versus what isn't — and how the archer's aim turns effort itself into the target.",
        "cards": [
          {
            "type": "intro",
            "title": "A Slave Wrote the Emperor's Manual",
            "body": "Epictetus was born a slave around 50 AD and walked with a lame leg. He owned almost nothing, ever. Yet his pocket handbook, the Enchiridion, became the operating manual of the Roman elite — the emperor Marcus Aurelius thanked his teacher Rusticus for lending him a copy of Epictetus's notes. What did a slave know about power? Where it actually lives.",
            "art": "book"
          },
          {
            "type": "concept",
            "title": "The First Sentence of Stoicism",
            "body": "The Enchiridion opens with a sorting rule. Up to us: our judgments, desires, and impulses — the mind's own acts. Not up to us: our body, property, reputation, career — anything other people, biology, or luck can touch. Misery, says Epictetus, comes from confusing the columns: staking your peace on the second while neglecting the first.",
            "art": "fork"
          },
          {
            "type": "mcq",
            "prompt": "By Epictetus's sorting rule, which of these is fully 'up to you'?",
            "choices": [
              "Your reputation at work",
              "Your physical health",
              "Your judgment about an insult",
              "Whether people reply to your messages"
            ],
            "answer": 2,
            "explain": "Reputation, health, and other people's replies all have outside forces as co-authors. Only the mind's own acts — judgment, intention, response — carry zero external dependency, which is why the Stoics built everything on them."
          },
          {
            "type": "concept",
            "title": "Why the Line Is Drawn So Hard",
            "body": "Even your body is only on loan — illness, aging, and accident all get a vote. Epictetus, lame in one leg, knew it literally. The point isn't that externals don't matter; the Stoics called good ones 'preferred.' It's that nothing dependent on the outside can be the foundation of a life. The one asset no one can confiscate is how you judge and respond.",
            "art": "shield"
          },
          {
            "type": "example",
            "title": "The Stoic Archer",
            "body": "Cicero, explaining Stoic doctrine around 45 BC, reached for an archer. The archer's job is to do everything in his power to aim true; the actual hit belongs partly to the wind. So the hit is 'to be chosen, but not desired' — the real target is flawless aiming. Success gets redefined as the quality of the attempt, because only the attempt is his.",
            "art": "target"
          },
          {
            "type": "reveal",
            "prompt": "Job interview tomorrow. Before reading on: which parts of it are actually up to you?",
            "answer": "Up to you: preparation, sleep, your questions, your composure, the follow-up note. Not up to you: the panel's mood, the budget, the internal candidate. The Stoic aims at 'interview well' — never 'get hired.'"
          },
          {
            "type": "concept",
            "title": "Internalize the Goal",
            "body": "Philosopher William B. Irvine (A Guide to the Good Life, 2009) calls this internalizing your goals. Don't aim at 'win the match' — an outcome your opponent co-writes. Aim at 'play to my ceiling.' Same training, same effort on the day, but the target now sits entirely inside your jurisdiction, where losing it requires your own cooperation.",
            "art": "compass"
          },
          {
            "type": "quote",
            "text": "You may fetter my leg, but my will not even Zeus himself can overpower.",
            "by": "Epictetus"
          },
          {
            "type": "truefalse",
            "statement": "Since outcomes aren't up to us, the Stoics concluded that trying hard is pointless.",
            "answer": false,
            "explain": "The archer still trains for years and aims with total care — outcomes are 'preferred,' just not the measure of success. Stoicism relocates the goal from the result to the quality of the effort; it never shrinks the effort."
          },
          {
            "type": "example",
            "title": "From Chains to the Classroom",
            "body": "Freed from slavery, then banished from Rome around 93 AD when Domitian expelled the philosophers, Epictetus rebuilt in Nicopolis, Greece. He lived with famous simplicity: when his iron lamp was stolen, he replaced it with clay, noting the thief had paid dearly — he'd become a thief for the price of a lamp. His student Arrian recorded it all in the Discourses, around 108 AD.",
            "art": "ladder"
          },
          {
            "type": "mcq",
            "prompt": "You're stuck in traffic, guaranteed late for a big meeting. What's the Stoic move?",
            "choices": [
              "Accept that meetings don't matter in the grand scheme",
              "Sort it: the traffic isn't up to you; messaging ahead, rerouting, and staying composed are",
              "Suppress your frustration and act unbothered",
              "Review what you should have done to avoid this"
            ],
            "answer": 1,
            "explain": "Stoicism is an audit, not detachment or performed calm: full effort on everything in your column, full release on the rest. The frustration usually dies during the audit."
          },
          {
            "type": "recap",
            "title": "The Dichotomy of Control",
            "points": [
              "Sort everything into two columns: judgments, intentions, and responses are up to you; body, reputation, and outcomes are not.",
              "Be the archer: do everything in your power to aim true, and treat the hit as 'to be chosen, not desired.'",
              "Internalize goals — 'play to my ceiling,' never 'win the match' — so success sits inside your jurisdiction.",
              "The daily audit: full effort on your column, full release on the rest."
            ]
          }
        ],
        "review": [
          {
            "front": "According to Epictetus, what is truly up to us?",
            "back": "Our judgments, desires, impulses, and responses — the mind's own acts. Not up to us: body, property, reputation, outcomes."
          },
          {
            "front": "What does the Stoic archer metaphor (via Cicero) teach?",
            "back": "Do everything in your power to aim true; the hit depends partly on wind. The hit is 'to be chosen, not desired' — the aim itself is the goal."
          },
          {
            "front": "What is 'internalizing goals' (William Irvine)?",
            "back": "Recasting outcome goals as process goals: aim at 'play to my ceiling,' not 'win the match,' so success depends only on what's up to you."
          },
          {
            "front": "Who was Epictetus, and how did the Enchiridion reach us?",
            "back": "A former slave who taught Stoicism in Nicopolis, Greece; his student Arrian compiled his teachings into the Enchiridion ('handbook') around 125 AD."
          }
        ]
      },
      {
        "id": "negative-visualization",
        "title": "Negative Visualization",
        "summary": "Seneca's rehearsals for loss: premeditatio malorum, practiced poverty, and voluntary discomfort as the antidote to hedonic adaptation.",
        "cards": [
          {
            "type": "intro",
            "title": "The Billionaire Who Practiced Poverty",
            "body": "Seneca advised the emperor Nero, and his critics put his fortune at 300 million sesterces — among the largest in Rome. Yet he regularly set aside days to wear rough clothes, eat stale bread, and sleep hard, asking one question throughout: 'Is this the condition that I feared?' He wasn't punishing himself. He was running a drill.",
            "art": "coin"
          },
          {
            "type": "concept",
            "title": "Premeditatio Malorum",
            "body": "The 'premeditation of evils': briefly rehearse the setback before it arrives — the lost client, the delayed flight, the bad diagnosis. Writing after fire leveled the city of Lyon, Seneca observed that the unexpected blow lands heaviest; surprise adds its own weight to disaster. Rehearsal doesn't summon the disaster. It cancels the surprise surcharge.",
            "art": "shield"
          },
          {
            "type": "truefalse",
            "statement": "Negative visualization means dwelling on worst-case scenarios until you feel prepared.",
            "answer": false,
            "explain": "It's a brief, scheduled visit — seconds, not hours — after which you return to a present that suddenly looks richer. Rumination moves in and redecorates; premeditatio tours the property and leaves."
          },
          {
            "type": "concept",
            "title": "The Treadmill Under Your Feet",
            "body": "Psychologists Brickman and Campbell named it the 'hedonic treadmill' in 1971: we adapt to gains until they become the invisible new normal. In a famous (and small) 1978 study, Brickman and colleagues found recent lottery winners were not significantly happier than controls — and took less pleasure in everyday things. The raise, the car, the title: all absorbed.",
            "art": "graph"
          },
          {
            "type": "example",
            "title": "Kissing a Mortal",
            "body": "Epictetus pushed the practice to its edge: as you kiss your child goodnight, says the Enchiridion, tell yourself you are kissing a mortal. Brutal on first read. But watch what it does to that ordinary kiss — it stops being routine and becomes an event. The Stoics used mortality the way a frame uses black: to make everything inside it vivid.",
            "art": "hourglass"
          },
          {
            "type": "mcq",
            "prompt": "Why does briefly imagining loss increase enjoyment, on the Stoic account?",
            "choices": [
              "It lowers expectations, so any outcome feels like a win",
              "It interrupts hedonic adaptation — the familiar feels contingent, and therefore valuable, again",
              "The relief of returning to reality gives a pleasure spike",
              "It protects against the loss actually happening"
            ],
            "answer": 1,
            "explain": "Adaptation runs on assumed permanence: whatever feels guaranteed goes unnoticed. Imagined loss breaks the assumption, so you see what you have as temporarily yours — which it always was."
          },
          {
            "type": "example",
            "title": "Letter 18: The Poverty Drill",
            "body": "In Letter 18, Seneca hands Lucilius the protocol: set aside a certain number of days of 'the scantiest and cheapest fare' and 'coarse and rough dress' — not as a game, but until the fear of poverty loses its grip. A rich man who has practiced being poor has revoked his fortune's power to blackmail him. The drill converts a terror into a Tuesday.",
            "art": "anchor"
          },
          {
            "type": "quote",
            "text": "It is precisely in times of immunity from care that the soul should toughen itself beforehand for occasions of greater stress.",
            "by": "Seneca"
          },
          {
            "type": "reveal",
            "prompt": "Seneca ran his poverty drill holding one question: 'Is this the condition that I feared?' What answer did the drill keep returning?",
            "answer": "No. Met in person, the feared condition was merely uncomfortable — and briefly. The fear had been doing all the damage, and once tested, poverty could no longer threaten him into compromise."
          },
          {
            "type": "concept",
            "title": "Voluntary Discomfort",
            "body": "Musonius Rufus, Epictetus's teacher, prescribed training in cold, heat, hunger, and hard beds — body and soul train together, he argued. The modern versions are cheap: the cold shower, the fast, the walk when you could ride. This isn't toughness theater. Every discomfort you have befriended is one less lever the world holds against you.",
            "art": "mountain"
          },
          {
            "type": "mcq",
            "prompt": "You finally bought the car you wanted for years. Which practice keeps the joy from evaporating?",
            "choices": [
              "Plan the next upgrade so there's always something ahead",
              "Avoid thinking about the car so it stays special",
              "Briefly picture it gone — totaled, sold, or never bought",
              "Compare it often with worse cars"
            ],
            "answer": 2,
            "explain": "More stimulation just speeds up the treadmill, and avoidance lets adaptation run silently. Imagined absence resets it: the car becomes, again, something you get to have rather than something you merely have."
          },
          {
            "type": "recap",
            "title": "Negative Visualization",
            "points": [
              "Premeditatio malorum: rehearse setbacks briefly, on purpose — surprise is a surcharge you can cancel.",
              "Hedonic adaptation absorbs every gain (Brickman's treadmill); imagined loss is the reset button.",
              "Run Seneca's Letter 18 drill: meet a feared condition in person and ask, 'Is this what I feared?'",
              "Voluntary discomfort widens the comfort zone — what you can happily endure can't be used to threaten you."
            ]
          }
        ],
        "review": [
          {
            "front": "What is premeditatio malorum?",
            "back": "Brief, deliberate rehearsal of possible setbacks so the blow loses its surprise — and what you still have regains its value."
          },
          {
            "front": "What is hedonic adaptation (the 'hedonic treadmill')?",
            "back": "Happiness drifts back to baseline after gains. In Brickman's 1978 study, lottery winners weren't significantly happier and enjoyed daily pleasures less."
          },
          {
            "front": "What was Seneca's 'practice poverty' drill (Letter 18)?",
            "back": "Set aside days of the cheapest food and roughest clothes, asking: 'Is this the condition that I feared?' A tested fear loses its grip."
          },
          {
            "front": "How does negative visualization differ from rumination?",
            "back": "It's a brief, scheduled visit to imagined loss, then back to the present with gratitude. Rumination moves in; visualization tours and leaves."
          }
        ]
      },
      {
        "id": "amor-fati",
        "title": "Amor Fati and the View From Above",
        "summary": "Marcus Aurelius's tools for wanting what happens: the obstacle as the way, and the cosmic zoom-out that shrinks problems to true size.",
        "cards": [
          {
            "type": "intro",
            "title": "Notes From a Plague-Years War Camp",
            "body": "In the 170s AD, in army camps along the Danube — entries are headed 'Among the Quadi' and 'At Carnuntum' — the most powerful man alive wrote Greek notes to himself, never meant for publication. Around him: a plague killing millions, a grinding war, and soon a trusted general's betrayal. We call the notes the Meditations. Their project: how to want what happens.",
            "art": "map"
          },
          {
            "type": "concept",
            "title": "Wish Things As They Happen",
            "body": "Epictetus's instruction (Enchiridion 8): do not demand that events happen as you wish; wish them to happen as they do happen, and life will go well. Nietzsche later gave the stance its Latin name, amor fati — love of fate — in The Gay Science (1882). This is not resignation. It is accepting what has already happened as the raw material for your next move.",
            "art": "wave"
          },
          {
            "type": "mcq",
            "prompt": "Who actually coined the Latin phrase 'amor fati'?",
            "choices": [
              "Marcus Aurelius",
              "Seneca",
              "Friedrich Nietzsche",
              "Cicero"
            ],
            "answer": 2,
            "explain": "The phrase debuts in Nietzsche's The Gay Science (1882) — 'let that be my love henceforth!' The attitude is ancient, though: Epictetus told students to wish events to happen as they do happen. Nietzsche named a Stoic move."
          },
          {
            "type": "concept",
            "title": "The Obstacle Course Is the Course",
            "body": "Meditations 5.20: the mind converts every hindrance to its own purposes. A blocked plan isn't the end of action — it's a reassignment. The rival who beat you assigns you rigor. The delay assigns you patience. The insult assigns you self-command. Nothing that happens lacks a use; you just rarely get to choose which virtue gets called up.",
            "art": "path"
          },
          {
            "type": "example",
            "title": "Stress-Testing the Philosophy",
            "body": "Marcus reigned 161–180 through the Antonine plague — estimates run to five million dead or more — and near-constant frontier war. In 175, his general Avidius Cassius declared himself emperor on a false report of Marcus's death. Cassius Dio records Marcus's reaction: grief that the rebel's assassination had robbed him of the chance to pardon him.",
            "art": "shield"
          },
          {
            "type": "truefalse",
            "statement": "For Marcus, loving fate meant accepting events passively instead of fighting to change them.",
            "answer": false,
            "explain": "Marcus spent two decades in armor doing the opposite of passive. Amor fati covers what has already happened — that becomes material, not grievance — while what happens next is still your move."
          },
          {
            "type": "concept",
            "title": "The View From Above",
            "body": "Meditations 9.30: 'look down from above' — the countless herds and their ceremonies, the voyages in storm and calm, whole generations being born, living together, vanishing. The scholar Pierre Hadot identified this zoom-out as a core Stoic 'spiritual exercise.' The aim isn't to make life feel meaningless — it's to let your problem shrink back to its actual size.",
            "art": "eye"
          },
          {
            "type": "quote",
            "text": "The impediment to action advances action. What stands in the way becomes the way.",
            "by": "Marcus Aurelius"
          },
          {
            "type": "reveal",
            "prompt": "Astronauts get the Stoic zoom-out by rocket. What do they report about national borders seen from orbit?",
            "answer": "They aren't there — no lines on the actual planet. Writer Frank White (1987) named the shift the 'overview effect': from far enough up, fierce local disputes look small and shared. Marcus ran the same exercise from a war camp, no rocket required."
          },
          {
            "type": "example",
            "title": "The Lab Catches Up",
            "body": "Psychologist Ethan Kross finds that self-distancing — reviewing your situation as an observer, even just coaching yourself by name instead of 'I' — measurably cools anxiety and rumination in lab studies. The mechanism is Marcus's: the same event, viewed from farther away, produces a smaller signal. Distance is a dial, and you're allowed to turn it.",
            "art": "lens"
          },
          {
            "type": "mcq",
            "prompt": "Months of work, and your project just got cancelled. Which response is the Meditations 5.20 move?",
            "choices": [
              "Decide you never really cared about the project",
              "Ask what the cancellation frees up, or which virtue it now demands",
              "Vent thoroughly so the frustration doesn't fester",
              "Document who is to blame, for the record"
            ],
            "answer": 1,
            "explain": "The impediment advances action by reassigning it: freed capacity, a hard lesson in shipping earlier, a chance at visible equanimity. The cancellation is fixed history — amor fati — but its use is still unassigned."
          },
          {
            "type": "recap",
            "title": "Amor Fati and the View From Above",
            "points": [
              "Amor fati: wish events to happen as they do happen (Epictetus); Nietzsche coined the Latin name in 1882.",
              "The impediment advances action: every obstacle reassigns you to a virtue — rigor, patience, self-command.",
              "Acceptance covers what has already happened; effort covers what's next. They run in sequence, not competition.",
              "When a problem swells, take the view from above — and Kross's self-distancing studies suggest the dial works."
            ]
          }
        ],
        "review": [
          {
            "front": "Who coined 'amor fati,' and what is its Stoic root?",
            "back": "Nietzsche, in The Gay Science (1882). The attitude is Epictetus's: wish events to happen as they do happen — then act on what's yours."
          },
          {
            "front": "What does Meditations 5.20 say about obstacles?",
            "back": "'The impediment to action advances action. What stands in the way becomes the way' — every obstacle becomes material for some virtue."
          },
          {
            "front": "What is the 'view from above'?",
            "back": "A Stoic zoom-out (Meditations 9.30; named by Pierre Hadot): view your problem from city, planet, and century until it shrinks to true size."
          },
          {
            "front": "What is self-distancing (Ethan Kross)?",
            "back": "Viewing your situation as an observer — e.g., third-person self-talk — which lab studies show cools anxiety and rumination. A tested view from above."
          }
        ]
      },
      {
        "id": "anger-and-grief",
        "title": "Anger, Grief, and the Gap",
        "summary": "Seneca's On Anger and the Stoic gap between impression and assent — plus what the Stoics actually taught about tears.",
        "cards": [
          {
            "type": "intro",
            "title": "Rome's Anger-Management Manual",
            "body": "In the 40s AD, Seneca wrote On Anger for his brother Novatus — three books opening with a claim: no plague has cost the human race more. His inventory: cities ruined, families poisoned, nations slaughtered, all by the one passion that markets itself as strength. Buried in Book Two is a mechanism modern psychology would rediscover: the gap.",
            "art": "flame"
          },
          {
            "type": "concept",
            "title": "Anger Is a Sequence, Not a Flash",
            "body": "Seneca dissects anger into stages. First comes the involuntary jolt — heat, quickened pulse, the flinch. That is a 'first movement,' and even the perfect sage feels it. Then a judgment arrives: 'I have been wronged, and retaliation is fitting.' Only when you assent to that judgment does anger exist. The feeling is weather. The assent is a signature.",
            "art": "layers"
          },
          {
            "type": "truefalse",
            "statement": "If your face flushes when you're insulted, you've already failed as a Stoic.",
            "answer": false,
            "explain": "The flush is a propatheia — a pre-emotion the Stoics classed as involuntary and felt even by the sage. Aulus Gellius tells of a Stoic philosopher going pale in a storm at sea, then explaining: impressions strike everyone; the sage declines to co-sign them."
          },
          {
            "type": "concept",
            "title": "The Gap: Impression vs. Assent",
            "body": "An impression arrives: 'that email was a slight.' Stoic psychology places a checkpoint between the impression and your endorsement of it — between what strikes you and what you sign. Epictetus built his entire school on that checkpoint. On this model, anger is never something that happens to you. It is something you agree to, and agreement can be withheld.",
            "art": "fork"
          },
          {
            "type": "quote",
            "text": "Men are disturbed not by the things which happen, but by the opinions about the things.",
            "by": "Epictetus"
          },
          {
            "type": "mcq",
            "prompt": "Seneca says anger only exists once you assent to the judgment 'I've been wronged.' Which remedy follows — and topped his list in On Anger?",
            "choices": [
              "Vent it early, before pressure builds",
              "Avoid people who provoke you",
              "Channel it into hard work",
              "Delay — hold off on signing the judgment"
            ],
            "answer": 3,
            "explain": "'The greatest remedy for anger is delay,' Seneca writes: anger runs on a judgment, and a judgment inspected at leisure starts losing witnesses. Venting, it turns out, does the opposite of what it promises."
          },
          {
            "type": "example",
            "title": "The Catharsis Myth, Tested",
            "body": "In 2002, psychologist Brad Bushman had provoked participants hit a punching bag while thinking about the person who had angered them. They ended up angrier and more aggressive than people who sat quietly doing nothing. Venting doesn't drain anger; it rehearses the judgment that feeds it. Seneca's 'don't feed the impression' beat the data by nineteen centuries.",
            "art": "brain"
          },
          {
            "type": "reveal",
            "prompt": "A colleague's email reads like a slight. Before you reply, Seneca would have you run a short cross-examination. What's on it?",
            "answer": "Is the wrong certain, or is the email just terse? Have I written worse when rushed? What does delay cost — nothing? On Anger's finding: most anger cannot survive its own hearing."
          },
          {
            "type": "concept",
            "title": "The Stoics Did Not Ban Tears",
            "body": "Seneca to Lucilius, on the death of his friend Flaccus (Letter 63): let the eyes neither be dry nor overflow. Tears fall, even for the wise — a first movement, and human. What Seneca warns against is the additions: performing grief for an audience, and feeding it with the protest 'this should never have happened,' as if mortals losing mortals were a scandal.",
            "art": "wave"
          },
          {
            "type": "concept",
            "title": "Grief Is Love, Redirected",
            "body": "Letter 63's turn: let the memory of a dead friend become like fruit that is pleasingly sharp — grief aging into gratitude. The protest 'he should still be here' argues with fate and loses daily; the alternative is not forgetting but changing tense, from 'I have lost him' to 'I had him.' The love is not reduced. Only its direction changes.",
            "art": "seed"
          },
          {
            "type": "truefalse",
            "statement": "The Stoic ideal of apatheia still leaves room for tears at the death of a friend.",
            "answer": true,
            "explain": "True — apatheia is freedom from destructive passions, the rage and despair built on false judgments, not numbness. Seneca expected tears for Flaccus; what he condemned was performing them and feeding them with protest."
          },
          {
            "type": "example",
            "title": "From the Stoa to the Clinic",
            "body": "Albert Ellis, launching what became rational emotive behavior therapy in 1955, cited Epictetus's line on opinions as a cornerstone; Aaron Beck's cognitive therapy grew from the same soil. The best-tested modern talk therapies operate inside the Stoic gap: find the judgment sitting between event and emotion, and put it on trial. The checkpoint was there all along.",
            "art": "bridge"
          },
          {
            "type": "recap",
            "title": "Anger, Grief, and the Gap",
            "points": [
              "Anger is a sequence — jolt, judgment, assent — and only the assent is yours. The jolt is weather; the signature is optional.",
              "Seneca's greatest remedy is delay: cross-examine the judgment, and most anger loses its case. Venting rehearses it (Bushman, 2002).",
              "In grief, tears are human; the targets are the additions — performance, and the protest 'this should never have happened.'",
              "Change grief's tense from 'I have lost' to 'I had.' Modern CBT still works inside the gap Epictetus mapped."
            ]
          }
        ],
        "review": [
          {
            "front": "What are Stoic 'first movements' (propatheiai)?",
            "back": "Involuntary jolts — flush, startle, tears — felt even by the sage. Not yet emotion: anger or despair begin only when you assent to a judgment."
          },
          {
            "front": "What is Seneca's greatest remedy for anger?",
            "back": "Delay (On Anger). Anger runs on the judgment 'I've been wronged'; inspected at leisure, the judgment usually loses its case."
          },
          {
            "front": "Does venting anger reduce it?",
            "back": "No. In Bushman's 2002 study, hitting a punching bag while ruminating raised aggression above doing nothing. Venting rehearses the angry judgment."
          },
          {
            "front": "What did Seneca allow and forbid in grief (Letter 63)?",
            "back": "Tears, yes — eyes 'neither dry nor overflowing.' Forbidden: performing grief and protesting 'this shouldn't have happened.' Aim memory at gratitude."
          }
        ]
      }
    ]
  },
  {
    "id": "psychology-of-money",
    "title": "The Psychology of Money",
    "tagline": "Doing well with money is behavior, not brains.",
    "category": "Finance",
    "description": "Financial success is a soft skill: how you behave matters more than what you know. Four lessons on compounding, luck, panic, and knowing when you have enough—built on real studies, real numbers, and a few unforgettable stories.",
    "lessons": [
      {
        "id": "compounding-time",
        "title": "The Quiet Power of Compounding",
        "summary": "Why time, not genius, built Buffett's fortune—and how exponential growth breaks your intuition.",
        "cards": [
          {
            "type": "intro",
            "title": "The $81.5 Billion Footnote",
            "body": "When Morgan Housel ran the numbers in 2020, Warren Buffett was worth $84.5 billion. Of that, $84.2 billion arrived after his 50th birthday—and $81.5 billion after his mid-60s. Buffett is a great investor. But his fortune isn't really a story about picking stocks. It's a story about time.",
            "art": "seed"
          },
          {
            "type": "concept",
            "title": "Your Brain Thinks in Straight Lines",
            "body": "Ask people to project growth and they draw a line: 5, 10, 15, 20. Compounding draws a curve: 5, 10, 20, 40. Linear intuition served us fine for chasing antelope; it fails completely at doubling. And the mistake isn't small—the further out you look, the more absurdly the curve outruns the line.",
            "art": "graph"
          },
          {
            "type": "reveal",
            "prompt": "Take a sheet of paper 0.1 mm thick. Fold it in half 50 times (humor the physics). How tall is the stack?",
            "answer": "Over 100 million kilometers—roughly two-thirds of the way to the sun. Fifty doublings turn a tenth of a millimeter into an astronomical distance. If your gut said 'a few meters,' that gap is exactly why compounding keeps surprising you."
          },
          {
            "type": "concept",
            "title": "Buffett's Real Edge",
            "body": "Buffett bought his first stock at age 11 and was still compounding past 90. That is more than 80 years of uninterrupted growth. His annual returns—around 20%—are exceptional but not unheard of. What's unheard of is the duration. In compounding, returns are the base; time is the exponent.",
            "art": "hourglass"
          },
          {
            "type": "example",
            "title": "The Man Who Beat Buffett's Returns",
            "body": "Jim Simons's Medallion Fund compounded at roughly 66% a year before fees starting in 1988—the best long-term record ever measured, triple Buffett's rate. Yet Simons died in 2024 worth about $31 billion; Buffett that year was worth over $130 billion. The difference? Simons didn't hit his stride until nearly 50. Rate lost to runway.",
            "art": "mountain"
          },
          {
            "type": "mcq",
            "prompt": "Simons compounded three times faster than Buffett. Why did Buffett end up roughly four times richer?",
            "choices": [
              "Buffett used more leverage and took bigger risks",
              "Buffett started at 11 and never stopped—about 50 more years of compounding",
              "Medallion's high fees consumed Simons's edge",
              "Buffett's holdings were more tax-efficient"
            ],
            "answer": 1,
            "explain": "Duration beats rate. Fifty extra years means dozens of extra doublings, and each doubling matters more than the last. A good return sustained for decades outruns a spectacular one started late."
          },
          {
            "type": "example",
            "title": "The Ten-Year Head Start",
            "body": "Invest $500 a month at a 7% annual return. Start at 25 and you'll have about $1.3 million at 65. Start at 35—same money, same return—and you'll have about $610,000. Skipping the first decade costs more than half the total, because the earliest dollars are the ones that double the most times.",
            "art": "ladder"
          },
          {
            "type": "truefalse",
            "statement": "A 25-year-old earning 7% a year will still end up ahead at 65 of a 35-year-old who manages 9%.",
            "answer": true,
            "explain": "Run it: $500 a month at 7% from age 25 grows to about $1.3 million; at 9% from 35, about $915,000. Two extra points of return—already hard to achieve—can't buy back ten years of doublings. Starting early beats investing brilliantly."
          },
          {
            "type": "concept",
            "title": "Never Interrupt It",
            "body": "Compounding is back-loaded: by definition, the final doubling equals everything that came before it. So the costliest mistake isn't a bad pick—it's an interruption. Cashing out, pausing, or restarting from zero doesn't trim the curve; it amputates the end, where nearly all the money was going to be.",
            "art": "shield"
          },
          {
            "type": "reveal",
            "prompt": "A lily patch doubles in size every day and covers the whole pond on day 48. On what day did it cover half the pond?",
            "answer": "Day 47. Not day 24. Everything before was preamble; the last doubling did half the work. Quit on day 46 and you leave with a quarter of the pond. That is what interrupting compounding actually costs."
          },
          {
            "type": "quote",
            "text": "The first rule of compounding is to never interrupt it unnecessarily.",
            "by": "Charlie Munger"
          },
          {
            "type": "recap",
            "title": "Time Does the Heavy Lifting",
            "points": [
              "Buffett's fortune is mostly a time story: more than 99% of it arrived after his 50th birthday.",
              "Intuition is linear; compounding is exponential and back-loaded—the last doubling does half the work.",
              "Starting ten years earlier beats earning two extra points of return.",
              "The costliest error is interruption: cashing out amputates the end of the curve, where the money is."
            ]
          }
        ],
        "review": [
          {
            "front": "Roughly how much of Warren Buffett's wealth arrived after age 50?",
            "back": "Nearly all of it—$84.2B of the $84.5B he was worth in 2020. Time, not just skill, built the fortune."
          },
          {
            "front": "Jim Simons compounded at ~66% a year, triple Buffett's rate. Why did Buffett end up far richer?",
            "back": "Duration. Buffett compounded for 80+ years from age 11; Simons found his stride near 50. In compounding, time beats rate."
          },
          {
            "front": "Investing $500/month at 7%, what does starting at 35 instead of 25 cost you by 65?",
            "back": "More than half the outcome: about $1.3M vs. about $610K. The earliest dollars double the most times."
          },
          {
            "front": "A lily patch doubles daily and covers a pond on day 48. When was it half covered, and why does it matter?",
            "back": "Day 47. Compounding is back-loaded—the final doubling does half the work—so interrupting it is the costliest mistake."
          }
        ]
      },
      {
        "id": "luck-and-risk",
        "title": "Luck, Risk & the Invisible Graveyard",
        "summary": "Why we learn the wrong lessons from winners—and what bullet holes in WWII bombers reveal about success.",
        "cards": [
          {
            "type": "intro",
            "title": "One School in 303 Million",
            "body": "In 1968, about 303 million people of high-school age were alive on Earth. Roughly 300 of them attended Lakeside School in Seattle—one of the only schools anywhere with a computer terminal, bought with rummage-sale money by the school's Mothers' Club. One of those 300 was a 13-year-old named Bill Gates.",
            "art": "key"
          },
          {
            "type": "concept",
            "title": "Luck and Risk Are Twins",
            "body": "Every outcome is effort multiplied by forces outside your control. Luck and risk are the same force with opposite signs: the world is too complex for 100% of your results to come from 100% of your decisions. Gates was brilliant and worked obsessively—and he was also one in a million. Both are true at once.",
            "art": "balance"
          },
          {
            "type": "example",
            "title": "Kent Evans",
            "body": "Gates's best friend at Lakeside was Kent Evans—just as gifted at the terminal, an equal partner in every scheme, likely a Microsoft founder alongside him. Evans died in a mountaineering accident before graduation. Gates experienced one-in-a-million luck; Evans, one-in-a-million risk. Same magnitude, opposite direction.",
            "art": "mirror"
          },
          {
            "type": "truefalse",
            "statement": "Given Gates's talent and drive, Microsoft would have happened with or without the Lakeside terminal.",
            "answer": false,
            "explain": "Gates himself disagrees: 'If there had been no Lakeside, there would have been no Microsoft,' he told the school in 2005. Skill was necessary but not sufficient—thousands of equally driven kids never got 1968 computer access."
          },
          {
            "type": "concept",
            "title": "The Graveyard Doesn't Give Interviews",
            "body": "Survivorship bias is learning only from what survived. Failed founders don't give commencement speeches. Funds that blow up get quietly deleted from performance databases—a practice that inflates reported industry returns. Copy a winner's habits and you're also copying the habits of a thousand losers you can't see.",
            "art": "eye"
          },
          {
            "type": "reveal",
            "prompt": "WWII analysts mapped bullet holes on bombers returning from missions: wings and fuselage riddled, engines nearly untouched. The military wanted armor where the holes clustered. What did statistician Abraham Wald say?",
            "answer": "Armor the engines—the spots with no holes. The map showed where a plane could be hit and still make it home. Bombers hit in the engines never returned to be counted. The fatal evidence was missing from the sample."
          },
          {
            "type": "concept",
            "title": "Tails Drive Everything",
            "body": "Outcomes aren't spread evenly; a handful of extremes do nearly all the work. Correlation Ventures examined about 21,000 venture financings from 2004 to 2014: 65% lost money, while roughly half a percent—the deals returning 50x or more—drove most of the industry's gains. The typical outcome is failure; the aggregate is a fortune.",
            "art": "pyramid"
          },
          {
            "type": "mcq",
            "prompt": "J.P. Morgan studied the Russell 3000 index since 1980. Roughly what share of its stocks produced effectively all of the index's overall gains?",
            "choices": [
              "About 7%",
              "About half",
              "Nearly all of them, fairly evenly",
              "About a third"
            ],
            "answer": 0,
            "explain": "Meanwhile 40% of the stocks suffered catastrophic declines of 70% or more and never recovered. An index works because a few extreme winners—the tails—more than pay for a graveyard of losers."
          },
          {
            "type": "example",
            "title": "Berkshire's Ten Stocks",
            "body": "Buffett has said he's owned 400 to 500 stocks in his life and made most of his money on about 10 of them. Munger has made the same point: remove a handful of top decisions and Berkshire's long-term record looks ordinary. The best investors aren't right most of the time—they're occasionally right in enormous ways.",
            "art": "coin"
          },
          {
            "type": "truefalse",
            "statement": "Elite investors distinguish themselves by being right on nearly every position they take.",
            "answer": false,
            "explain": "Buffett owned 400–500 stocks and made most of his money on about 10. What separates the greats is how much their winners win—and surviving long enough to catch a tail—not a high batting average."
          },
          {
            "type": "quote",
            "text": "Success is a lousy teacher. It seduces smart people into thinking they can't lose.",
            "by": "Bill Gates"
          },
          {
            "type": "concept",
            "title": "What to Do With This",
            "body": "Three moves. Judge broad patterns, not individual stories—one winner might be luck, but ten thousand outcomes are signal. Discount your own success a notch, and your failures too. And plan for tails: leave room for error, because you can't know in advance which bet—or which blow—will be the one that matters.",
            "art": "compass"
          },
          {
            "type": "recap",
            "title": "Respect the Graveyard",
            "points": [
              "Luck and risk are the same force with opposite signs: Gates got the one-in-a-million terminal; Kent Evans got the accident.",
              "Survivorship bias: losers are invisible, so winners' habits look more causal than they are.",
              "Wald's bombers: armor where the holes aren't—the fatal data never makes it back.",
              "Tails drive outcomes: ~0.5% of VC deals and ~7% of Russell 3000 stocks produced most of the returns.",
              "Study patterns, not heroes—and leave room for error."
            ]
          }
        ],
        "review": [
          {
            "front": "What is survivorship bias?",
            "back": "Learning only from survivors. Failures vanish—dead startups, deleted funds—so winners' traits look more causal than they really are."
          },
          {
            "front": "Where did Abraham Wald say to armor WWII bombers, and why?",
            "back": "The engines—where returning planes had no holes. Planes hit there never made it back; the missing data marked the fatal spots."
          },
          {
            "front": "What do Bill Gates and Kent Evans together illustrate?",
            "back": "Luck and risk as twins: Gates got one-in-a-million computer access at Lakeside; Evans, equally gifted, died before graduation."
          },
          {
            "front": "What are 'tail events' in investing?",
            "back": "A tiny share of bets drives nearly all returns—about 0.5% of VC deals (50x+) and roughly 7% of Russell 3000 stocks produced most gains."
          }
        ]
      },
      {
        "id": "behavior-gap",
        "title": "The Behavior Gap",
        "summary": "Why investors reliably earn less than their own investments—and how to stop paying the panic tax.",
        "cards": [
          {
            "type": "intro",
            "title": "Your Fund Beat You",
            "body": "Here's an uncomfortable piece of arithmetic: the average investor earns less than the average investment they own. Morningstar's 'Mind the Gap' studies find investors trail their own funds by roughly one percentage point a year—money lost not to fees or markets, but to timing. The gap has a cause, and the cause is behavior.",
            "art": "mirror"
          },
          {
            "type": "concept",
            "title": "Buy High, Sell Low, Repeat",
            "body": "Financial planner Carl Richards named it the behavior gap: the distance between an investment's return and its investor's return. It opens because money arrives after good years, when confidence peaks, and flees after bad ones, when fear peaks. Same fund, worse outcome—the difference is when your dollars showed up.",
            "art": "fork"
          },
          {
            "type": "mcq",
            "prompt": "A fund posts 8% a year for a decade, but its average investor earns about 7%. What most likely explains the missing point?",
            "choices": [
              "Hidden management fees",
              "Investors bought after gains and sold after losses",
              "The fund misreported returns",
              "Dividend taxes"
            ],
            "answer": 1,
            "explain": "Posted returns already reflect fees. The gap is a timing problem: dollar-weighted returns lag because the crowd's money shows up in time for the losses and misses the recoveries."
          },
          {
            "type": "concept",
            "title": "Losses Scream Twice as Loud",
            "body": "In Kahneman and Tversky's experiments on choice, losses loomed roughly twice as large as equivalent gains—the core of prospect theory (1979). A portfolio down 20% doesn't feel like a sale; it feels like an emergency. That asymmetry is why selling at the bottom feels like relief, right up until the rebound.",
            "art": "brain"
          },
          {
            "type": "example",
            "title": "March 2020",
            "body": "COVID cut the S&P 500 by 34% in 23 trading days, and investors fled to cash at a record pace—money-market funds took in roughly $686 billion that March. The market bottomed on March 23, 2020; twelve months later it stood about 75% higher. Panic sellers converted a temporary decline into a permanent loss, then missed the rebound.",
            "art": "wave"
          },
          {
            "type": "truefalse",
            "statement": "Selling in a crash and re-entering once things calm down is low-cost, since the market's best days come during calm stretches.",
            "answer": false,
            "explain": "The best days cluster inside the storms: in J.P. Morgan's 2003–2022 data, seven of the market's ten best days landed within two weeks of the ten worst. Exit during panic and you almost guarantee missing the snapback."
          },
          {
            "type": "concept",
            "title": "Time In Beats Timing",
            "body": "J.P. Morgan ran the math on the S&P 500 from 2003 to 2022: $10,000 left fully invested grew to about $64,800. Missing just the 10 best days cut that to about $29,700—less than half. You don't need to catch the good days. You need to be unremovable when they arrive, which means staying put on the bad ones.",
            "art": "clock"
          },
          {
            "type": "reveal",
            "prompt": "Meet Bob, the world's worst market timer. He saved diligently but only invested at the very peaks—1972, 1987, 1999, 2007—each time just before a historic crash. One thing saved him: he never sold. How did Bob do?",
            "answer": "In Ben Carlson's simulation, Bob invested $184,000 over his career and retired in 2013 with about $1.1 million. Catastrophic timing, zero selling—and compounding still won. Time in the market bailed out the worst timing imaginable."
          },
          {
            "type": "quote",
            "text": "The investor's chief problem—and even his worst enemy—is likely to be himself.",
            "by": "Benjamin Graham"
          },
          {
            "type": "concept",
            "title": "Automate Past Your Amygdala",
            "body": "You won't out-discipline fear in the moment; nobody does. So remove the moment. Automatic contributions buy every month—through euphoria, through collapse—without consulting your feelings. Dollar-cost averaging isn't magic math; it's a machine for making the right move at times you'd never choose it by hand.",
            "art": "anchor"
          },
          {
            "type": "mcq",
            "prompt": "Markets fall 30% over a few weeks. For a long-term investor, which response does the evidence in this lesson support?",
            "choices": [
              "Sell now, buy back at the bottom",
              "Pause contributions until a recovery is confirmed",
              "Keep automatic contributions running on schedule",
              "Move everything into last year's best-performing fund"
            ],
            "answer": 2,
            "explain": "Bottoms are visible only in hindsight, and the best days hide inside the panic. The automated buyer gets both the rebound and the discount; the timer usually gets neither."
          },
          {
            "type": "recap",
            "title": "Close Your Gap",
            "points": [
              "The behavior gap: investors lag their own funds by about a point a year by buying high and selling low (Morningstar).",
              "Kahneman and Tversky: losses feel roughly twice as big as gains—which is why crashes trigger exactly the wrong move.",
              "Missing the 10 best days (2003–2022) cut $64,800 to $29,700—and those days cluster next to the worst ones.",
              "Bob bought only at peaks, never sold, and still retired a millionaire. Time in the market beats timing it.",
              "Automate contributions so the plan runs when your nerve won't."
            ]
          }
        ],
        "review": [
          {
            "front": "What is the behavior gap?",
            "back": "The distance between a fund's return and its investors' return—about 1 point a year (Morningstar)—caused by buying after gains and selling after losses."
          },
          {
            "front": "What did Kahneman and Tversky's experiments show about losses vs. gains?",
            "back": "Losses loomed roughly twice as large as equivalent gains (prospect theory, 1979)—why market drops push people to sell at the worst time."
          },
          {
            "front": "What happened to $10,000 in the S&P 500 (2003–2022) if you missed the 10 best days?",
            "back": "About $29,700 instead of about $64,800. And 7 of the 10 best days fell within two weeks of the 10 worst—panic sellers miss them."
          },
          {
            "front": "'Bob the world's worst market timer' invested only at market peaks. Why did he still retire a millionaire?",
            "back": "He never sold. Decades of compounding overwhelmed terrible entry points—time in the market beats timing the market."
          }
        ]
      },
      {
        "id": "enough",
        "title": "Enough",
        "summary": "The hedonic treadmill, invisible wealth, and why your savings rate—not your salary—decides how this ends.",
        "cards": [
          {
            "type": "intro",
            "title": "The Word Billionaires Can't Buy",
            "body": "At a billionaire's party on Shelter Island, Kurt Vonnegut needled his friend Joseph Heller: their host, a hedge fund manager, had made more money in a single day than Catch-22 had earned in its entire history. Heller's reply: 'I've got something he can never have—the knowledge that I've got enough.'",
            "art": "dialog"
          },
          {
            "type": "concept",
            "title": "The Hedonic Treadmill",
            "body": "Psychologists Philip Brickman and Donald Campbell coined the term in 1971: each gain in comfort resets your baseline, and the thrill fades to normal. The raise, the car, the bigger place—each delivers a spike, then becomes wallpaper. You run faster; the scenery stays the same.",
            "art": "orbit"
          },
          {
            "type": "reveal",
            "prompt": "A 1978 study compared recent lottery winners with people paralyzed in accidents, measuring their day-to-day happiness. What did it find?",
            "answer": "They were far closer than anyone predicts. Winners weren't significantly happier than controls and took less pleasure in ordinary things; accident victims, while unhappier, rated well above what outsiders assumed. Baselines pull hard in both directions."
          },
          {
            "type": "example",
            "title": "The Raise That Vanished",
            "body": "Lifestyle inflation is the treadmill with a paycheck: spending rises to meet income, so every raise gets converted into a new normal instead of new freedom. The $60K version of you envied the $90K version's life—yet the $90K version feels exactly as stretched. Income grew 50%; the distance to 'enough' didn't move.",
            "art": "ladder"
          },
          {
            "type": "concept",
            "title": "Wealth Is What You Don't See",
            "body": "Morgan Housel's distinction: rich is current income, visible in the car, the watch, the trips. Wealth is the money not spent—the options, the margin, the freedom to say no. Spending proves you had money; it can't show what you kept. The wealthiest person on the street is rarely the flashiest one.",
            "art": "eye"
          },
          {
            "type": "mcq",
            "prompt": "A stranger pulls up in a brand-new $120,000 sports car. What does the car actually tell you about their finances?",
            "choices": [
              "They're wealthy",
              "They have a high net worth",
              "They have $120,000 less than before—or a new loan",
              "They earn a high salary"
            ],
            "answer": 2,
            "explain": "Spending is evidence that money left, nothing more. Wealth is the unspent part, which is invisible by definition—so judging wealth by what you can see gets it exactly backwards."
          },
          {
            "type": "example",
            "title": "The Man Who Had Everything",
            "body": "Rajat Gupta ran McKinsey, sat on Goldman Sachs's board, and was worth about $100 million. By most accounts he wanted a billion. In 2008 he leaked boardroom secrets—including Buffett's $5 billion Goldman investment—to hedge fund manager Raj Rajaratnam. He went to prison. The point isn't the crime; it's that no amount works without a stop.",
            "art": "flame"
          },
          {
            "type": "truefalse",
            "statement": "If the odds are in your favor, it's rational to keep risking money you need for money you don't.",
            "answer": false,
            "explain": "Buffett's rule: never risk what you have and need for what you don't have and don't need. When the downside is ruin—freedom, reputation, family—no expected value compensates. Gupta ran that trade and lost everything real."
          },
          {
            "type": "concept",
            "title": "The Lever You Actually Control",
            "body": "You can't control market returns. You fully control your savings rate—and for a long time, it matters more. Saving $10,000 a year at a 5% return beats saving $5,000 a year at 10% for more than two decades: about $330,000 versus $286,000 after 20 years. Great returns are rare and fickle. A high savings rate is neither.",
            "art": "seed"
          },
          {
            "type": "mcq",
            "prompt": "You want your net worth to grow faster over the next decade. Which lever is most reliably in your hands?",
            "choices": [
              "Picking funds that beat the market",
              "Raising your savings rate",
              "Timing your entries and exits",
              "Forecasting interest rates"
            ],
            "answer": 1,
            "explain": "It's the only lever with a guaranteed payoff. Raising your savings rate works with certainty; beating the market is rare, unpredictable, and—as the earlier lessons showed—often luck wearing a costume."
          },
          {
            "type": "concept",
            "title": "The Ladder Has No Top",
            "body": "A rookie ballplayer making $500,000 is rich—until he compares himself with Mike Trout's $426 million contract. Trout looks underpaid next to hedge fund managers who have cleared $1 billion in a year. There is always a bigger number. Comparison outsources your 'enough' to strangers who will never say stop; only an internal line ends the game.",
            "art": "mountain"
          },
          {
            "type": "quote",
            "text": "It is not the man who has too little, but the man who craves more, that is poor.",
            "by": "Seneca"
          },
          {
            "type": "recap",
            "title": "Draw the Line Yourself",
            "points": [
              "The hedonic treadmill (Brickman & Campbell, 1971): gains reset your baseline, so spending buys spikes, not lasting satisfaction.",
              "Wealth is what you don't see—the unspent money that buys options and freedom. Visible spending proves only that money left.",
              "Your savings rate beats your return rate for decades, and it's the only lever fully in your control.",
              "Comparison has no finish line: Gupta had $100 million and traded everything for a shot at a billion.",
              "'Enough' is a decision, not a number the world hands you. Heller had it; his billionaire host didn't."
            ]
          }
        ],
        "review": [
          {
            "front": "What is the hedonic treadmill?",
            "back": "Brickman and Campbell's 1971 term: each gain resets your baseline, so new comfort quickly feels normal and the thrill fades."
          },
          {
            "front": "What did the 1978 lottery-winner study find?",
            "back": "Winners weren't significantly happier than controls and enjoyed everyday pleasures less—happiness baselines reassert themselves."
          },
          {
            "front": "What does 'wealth is what you don't see' mean?",
            "back": "Wealth is unspent money—options and freedom. Visible spending only proves money left, so flash is a poor signal of net worth."
          },
          {
            "front": "Saving $10K/yr at 5% vs. $5K/yr at 10%—who leads after 20 years?",
            "back": "The bigger saver: about $330K vs. $286K. Savings rate beats return rate for decades, and it's the lever you control."
          }
        ]
      }
    ]
  },
  {
    "id": "learning-how-to-learn",
    "title": "Learning How to Learn",
    "tagline": "How memory really works — and how to study so it sticks",
    "category": "Neuroscience",
    "description": "Fifty years of cognitive science have settled how memory forms — and why most studying fails. Master the evidence-backed techniques (spacing, retrieval, interleaving, deliberate practice) and the neuroscience of why they work.",
    "lessons": [
      {
        "id": "how-memory-forms",
        "title": "How Memory Forms",
        "summary": "Encoding, consolidation, and sleep: how experiences become lasting physical changes in your brain.",
        "cards": [
          {
            "type": "intro",
            "title": "The Man With No New Memories",
            "body": "In 1953, surgeons removed Henry Molaison's hippocampi to stop his seizures. It worked — but H.M. never formed another lasting memory. He read the same magazines fresh each time and greeted his doctors as strangers for 50 years. His loss mapped the machinery of memory: where it's made, how it's stored, and why those are different places.",
            "art": "key"
          },
          {
            "type": "concept",
            "title": "Step One: Encoding",
            "body": "Memory starts with encoding: attention selects a sliver of experience and turns it into a pattern of neural firing. No attention, no trace. And depth matters — in Fergus Craik and Robert Lockhart's framing, processing meaning encodes far better than processing surface. It's why you instantly forget names you never really heard.",
            "art": "lens"
          },
          {
            "type": "truefalse",
            "statement": "Your brain records everything you experience; forgetting is just a failure to find the file.",
            "answer": false,
            "explain": "Most of experience is never encoded in the first place: without attention, information decays from sensory memory in seconds, leaving nothing to retrieve later."
          },
          {
            "type": "concept",
            "title": "Wiring the Trace",
            "body": "A memory is a physical change. When neurons fire together, the synapses linking them strengthen, so the whole pattern reactivates more easily next time. Tim Bliss and Terje Lomo first recorded this process — long-term potentiation — in the rabbit hippocampus in 1973. Fifty years on, LTP remains the leading physical account of learning.",
            "art": "network"
          },
          {
            "type": "quote",
            "text": "Cells that fire together, wire together.",
            "by": "Carla Shatz, neuroscientist"
          },
          {
            "type": "concept",
            "title": "From Hippocampus to Cortex",
            "body": "New memories depend on the hippocampus, which binds an event's scattered pieces — sight, sound, place — into one retrievable pattern. Over weeks to years, consolidation gradually installs that pattern in the neocortex for the long haul. That's why H.M. kept his old memories but couldn't make new ones: he lost the recorder, not the archive.",
            "art": "bridge"
          },
          {
            "type": "mcq",
            "prompt": "H.M. got steadily better at tracing a star seen only in a mirror — while insisting each day he'd never tried the task. Why could he learn this?",
            "choices": [
              "His hippocampus partially grew back",
              "Motor memories are a kind of fact memory, just faster to form",
              "Skill learning runs on separate circuits that don't need the hippocampus",
              "He retained the memories but couldn't report them"
            ],
            "answer": 2,
            "explain": "Procedural skills run on other circuits — basal ganglia and cerebellum — so they survived his surgery. Brenda Milner's mirror-drawing studies with H.M. split memory into multiple systems."
          },
          {
            "type": "concept",
            "title": "Sleep: The Replay Session",
            "body": "During deep slow-wave sleep, the hippocampus replays the day's firing patterns at high speed. Matthew Wilson and Bruce McNaughton first caught this in 1994: place cells in sleeping rats re-fired the maze routes they'd run that day. Replay drills fresh patterns into the cortex. Sleep isn't downtime for consolidation — it's the main event.",
            "art": "wave"
          },
          {
            "type": "reveal",
            "prompt": "You have an exam at 9 a.m. and you're behind. Cognitive science says one very common move is close to self-sabotage. Which one?",
            "answer": "The all-nighter. Skipping sleep cancels the consolidation window, so much of what you crammed never stabilizes. Sleeping between study and test protects more than an extra bleary hour gains."
          },
          {
            "type": "example",
            "title": "The 1924 Sleep Experiment",
            "body": "John Jenkins and Karl Dallenbach had two Cornell students memorize nonsense syllables, then either sleep in the lab or continue their day. After eight waking hours they recalled about one syllable in ten; after eight sleeping hours, more than five. Interference matters — but so does what sleep actively builds.",
            "art": "hourglass"
          },
          {
            "type": "truefalse",
            "statement": "Sleep protects memories purely passively, by shielding them from interfering experiences.",
            "answer": false,
            "explain": "Interference protection is real — it's what Jenkins and Dallenbach concluded in 1924 — but modern recordings show sleep is active: the hippocampus replays new patterns and transfers them to cortex."
          },
          {
            "type": "recap",
            "title": "Recap: How Memory Forms",
            "points": [
              "Encoding needs attention, and meaning encodes deeper than surface.",
              "A memory is strengthened synapses (LTP) spread across a network — not a file in a cell.",
              "The hippocampus binds new memories; consolidation slowly installs them in cortex.",
              "Deep sleep actively replays the day's learning — an all-nighter deletes the consolidation window."
            ]
          }
        ],
        "review": [
          {
            "front": "What did patient H.M.'s amnesia reveal about the hippocampus?",
            "back": "It's required to form new long-term declarative memories; old memories and motor-skill learning survived its removal."
          },
          {
            "front": "What is long-term potentiation (LTP)?",
            "back": "The lasting strengthening of synapses between co-active neurons — discovered by Bliss and Lomo (1973) — the leading physical account of memory."
          },
          {
            "front": "What happens to new memories during slow-wave sleep?",
            "back": "The hippocampus replays the day's firing patterns, strengthening them and transferring them to the cortex (consolidation)."
          },
          {
            "front": "Why does an all-nighter before an exam backfire?",
            "back": "Skipping sleep removes the consolidation window, so newly crammed material never stabilizes into lasting memory."
          }
        ]
      },
      {
        "id": "forgetting-curve",
        "title": "The Forgetting Curve & Spaced Repetition",
        "summary": "Ebbinghaus's forgetting curve, why cramming evaporates, and how spaced repetition defeats decay.",
        "cards": [
          {
            "type": "intro",
            "title": "The Man Who Forgot on Purpose",
            "body": "In the 1880s, Hermann Ebbinghaus memorized list after list of nonsense syllables — WID, ZOF, KAF — then retested himself at set delays, for years, with himself as the only subject. The curve he plotted from that grind explains why last semester is a blur, and exactly what it would take to keep the next one.",
            "art": "graph"
          },
          {
            "type": "concept",
            "title": "The Shape of Forgetting",
            "body": "Forgetting is fastest right after learning, then levels off. In Ebbinghaus's data, over 40% of what he'd gained was gone within 20 minutes and more than half within an hour; after a month, roughly a fifth remained. Exact numbers vary with the material, but the shape — a cliff, then a long slope — shows up everywhere.",
            "art": "mountain"
          },
          {
            "type": "mcq",
            "prompt": "You learn 20 new vocabulary words at 9 a.m. Based on Ebbinghaus's curve, when do you lose the largest share of them?",
            "choices": [
              "Steadily, at an even rate over the month",
              "Within the first hour after learning",
              "Overnight, while you sleep",
              "After a week, when unused memories expire"
            ],
            "answer": 1,
            "explain": "The curve is steepest immediately: more than half of Ebbinghaus's gains vanished within the first hour. Sleep, meanwhile, is when memories consolidate — not when they leak."
          },
          {
            "type": "concept",
            "title": "Reviews Reset the Curve",
            "body": "Each review interrupts the fall and resets the curve — and after every reset, the memory decays more slowly. Relearning is also cheaper than learning: Ebbinghaus measured 'savings,' the time saved the second time through. A few well-timed reviews can hold a memory that one heroic session cannot.",
            "art": "ladder"
          },
          {
            "type": "quote",
            "text": "With any considerable number of repetitions a suitable distribution of them over a space of time is decidedly more advantageous than the massing of them at a single time.",
            "by": "Hermann Ebbinghaus"
          },
          {
            "type": "concept",
            "title": "Cramming: A Loan, Not a Purchase",
            "body": "Cramming works — for about a day. Massed practice pumps up short-term performance while the underlying trace stays shallow, so the curve comes for it fast. Psychologist Robert Bjork calls this the gap between performance and learning: what you can do right now versus what will survive the week.",
            "art": "flame"
          },
          {
            "type": "truefalse",
            "statement": "If you can recall material perfectly at the end of a study session, it is safely learned.",
            "answer": false,
            "explain": "Immediate recall measures performance, which massed practice inflates. Learning is what remains after a delay — and cram-built memories fall off Ebbinghaus's cliff within days."
          },
          {
            "type": "concept",
            "title": "Same Hours, Different Schedule",
            "body": "In 2006, Nicholas Cepeda, Harold Pashler and colleagues synthesized 317 experiments on study timing. On final tests, spaced study averaged 47% recall against 37% for massed — with the same total study time. The spacing effect is one of the most reliable findings in a century and a half of memory research.",
            "art": "coin"
          },
          {
            "type": "reveal",
            "prompt": "You have ten hours to learn material for an exam one month away. How should you split the hours — and when?",
            "answer": "Spread them: several short sessions, with gaps sized to the deadline — roughly 10-20% of the retention interval. For a test a month out, that means reviewing every three to six days, not ten hours in one sitting."
          },
          {
            "type": "concept",
            "title": "Expanding Intervals",
            "body": "Spaced-repetition systems — from Sebastian Leitner's 1970s card boxes to Anki's algorithm — schedule each review for the moment you'd start to forget. Answer correctly and the next gap widens: a day, three days, a week, a month. The mild struggle to recall isn't friction; it's the part that re-flattens the curve.",
            "art": "orbit"
          },
          {
            "type": "example",
            "title": "The Bahrick Family Experiment",
            "body": "Psychologist Harry Bahrick enlisted his own family in a nine-year study, drilling foreign vocabulary on fixed schedules. Words practiced at 56-day intervals were retained years later far better than words drilled every 14 days — even though the wider spacing felt slower during learning. Long goals want long gaps.",
            "art": "seed"
          },
          {
            "type": "truefalse",
            "statement": "The longer you need to remember something, the wider your review gaps should be.",
            "answer": true,
            "explain": "Bahrick's 56-day gaps beat 14-day gaps years later, and Cepeda's follow-up work put the optimal gap near 10-20% of the retention interval. Spacing scales with ambition."
          },
          {
            "type": "recap",
            "title": "Recap: Beating the Curve",
            "points": [
              "Forgetting follows a cliff-then-slope curve: most loss happens within hours.",
              "Cramming buys performance today and loses it by next week — performance is not learning.",
              "Across 317 experiments, spacing the same hours lifted average recall from 37% to 47% (Cepeda et al., 2006).",
              "Widen the gap after each success; aim for gaps near 10-20% of how long you need to remember."
            ]
          }
        ],
        "review": [
          {
            "front": "What is the shape of Ebbinghaus's forgetting curve?",
            "back": "A cliff then a slope: more than half of new learning fades within about an hour, then decay slows; roughly a fifth remains at a month."
          },
          {
            "front": "Why does cramming fail for long-term retention?",
            "back": "Massed practice inflates immediate performance while the trace stays shallow — Bjork's performance-vs-learning gap. It decays within days."
          },
          {
            "front": "What did Cepeda et al.'s 2006 meta-analysis of 317 experiments find?",
            "back": "With identical study time, spaced practice averaged 47% on final tests versus 37% for massed — the spacing effect."
          },
          {
            "front": "How wide should review gaps be?",
            "back": "Roughly 10-20% of the retention interval, expanding after each successful recall. Bahrick: 56-day gaps beat 14-day for multi-year retention."
          }
        ]
      },
      {
        "id": "retrieval-practice",
        "title": "Retrieval Practice & Desirable Difficulties",
        "summary": "The testing effect, the fluency illusion, and why the study methods that feel worst work best.",
        "cards": [
          {
            "type": "intro",
            "title": "The Highlighter's Illusion",
            "body": "Two students prep for the same exam. One rereads the chapter four times, highlighter blazing, and feels great. The other reads it once, closes the book, and struggles to write down what she remembers. A week later, the struggler wins by a wide margin. That gap has a name — and a fix you can start using tonight.",
            "art": "mirror"
          },
          {
            "type": "concept",
            "title": "The Testing Effect",
            "body": "In 2006, Henry Roediger and Jeffrey Karpicke had students learn prose passages by restudying or by self-testing. Five minutes later, restudiers were ahead. A week later it flipped: the tested group recalled about 56% of the material versus 42%. Retrieval isn't a dipstick that measures memory — it's an act that builds it.",
            "art": "target"
          },
          {
            "type": "truefalse",
            "statement": "A practice test mainly measures what you already learned; the learning itself happened while you studied.",
            "answer": false,
            "explain": "Retrieval is a learning event in its own right — pulling a memory out strengthens it more than another study pass. In Roediger and Karpicke's data, one self-test beat rereading after a week."
          },
          {
            "type": "concept",
            "title": "Why Rereading Feels Like Learning",
            "body": "Rereading breeds fluency: the text gets smoother with each pass, and your brain misreads that ease as knowledge. But recognizing material on the page is a far lower bar than producing it from a blank sheet. Roediger and Karpicke's rereaders even predicted they'd remember the most. Confidence peaked exactly where learning didn't.",
            "art": "eye"
          },
          {
            "type": "mcq",
            "prompt": "Why does rereading a chapter feel so effective even when it isn't?",
            "choices": [
              "Highlighting distracts from the argument's structure",
              "Rereading works for facts, just not for concepts",
              "Fluency: the text feels easy to process, and ease gets mistaken for knowledge",
              "Rereading overwrites the original memory trace"
            ],
            "answer": 2,
            "explain": "Each pass lowers processing effort, and that ease masquerades as mastery — the fluency illusion. The only honest audit is recall with the book closed, which is exactly what retrieval practice provides."
          },
          {
            "type": "concept",
            "title": "Desirable Difficulties",
            "body": "Robert and Elizabeth Bjork's principle: conditions that make practice harder — and performance worse today — often make learning stronger tomorrow. Spacing, self-testing, generating, mixing topics. Within limits, the struggle isn't a cost of learning; it's the mechanism. If studying feels effortless, be suspicious.",
            "art": "mountain"
          },
          {
            "type": "concept",
            "title": "The Generation Effect",
            "body": "In 1978, Norman Slamecka and Peter Graf showed that generating a word from a cue — completing 'hot: c___' rather than reading 'hot: cold' — reliably improved later memory. Production beats reception. So before looking anything up, commit to a guess; even wrong guesses have been shown to help the correction stick.",
            "art": "lightbulb"
          },
          {
            "type": "reveal",
            "prompt": "Flashcard apps let you flip the card the instant you feel stuck. What's the single highest-leverage habit change the science suggests?",
            "answer": "Hold the struggle a few seconds longer. The effortful reach — even when it fails — deepens the trace and makes the correction stick. Instant flipping quietly turns retrieval practice back into rereading."
          },
          {
            "type": "concept",
            "title": "Interleaving: Mix It Up",
            "body": "Blocked practice — twenty problems of one type in a row — feels efficient because answers come faster and faster. Interleaving mixes the types, forcing you to choose a strategy, not just execute one. In Doug Rohrer and Kelli Taylor's 2007 study, interleavers scored 63% on a test a week later; blockers scored 20%.",
            "art": "fork"
          },
          {
            "type": "example",
            "title": "The Painting Study",
            "body": "Nate Kornell and Robert Bjork taught people to recognize 12 landscape painters' styles. Mixing the artists during study beat showing each painter's work in a block. The kicker: even after performing better with interleaving, nearly 80% of participants rated blocking as good or better. Your gut is a poor judge of study methods.",
            "art": "puzzle"
          },
          {
            "type": "truefalse",
            "statement": "A study method that produces more errors and slower progress during practice can still roughly triple your score a week later.",
            "answer": true,
            "explain": "That's a desirable difficulty at work. Rohrer and Taylor's interleavers looked worse in session, then scored 63% versus 20% on the delayed test. Judge methods by delayed results, not by feel."
          },
          {
            "type": "recap",
            "title": "Recap: Test Yourself",
            "points": [
              "Retrieval builds memory: self-testing beat rereading 56% to 42% one week out (Roediger & Karpicke, 2006).",
              "Rereading creates a fluency illusion — recognition feels like knowledge but isn't recall.",
              "Generate answers before checking; even wrong guesses help corrections stick.",
              "Interleave problem types, and judge study methods by delayed tests, never by in-session feel."
            ]
          }
        ],
        "review": [
          {
            "front": "What is the testing effect?",
            "back": "Retrieving information strengthens memory more than restudying it. Roediger & Karpicke (2006): 56% vs 42% recall after one week."
          },
          {
            "front": "Why does rereading feel effective when it isn't?",
            "back": "The fluency illusion: each pass makes text easier to process, and ease is mistaken for mastery. Recognition is a much lower bar than recall."
          },
          {
            "front": "What is the generation effect?",
            "back": "Generating an answer from a cue — even guessing wrong before checking — improves later memory versus passively reading it (Slamecka & Graf, 1978)."
          },
          {
            "front": "What did Rohrer & Taylor (2007) find about interleaved math practice?",
            "back": "Mixed practice felt harder but produced 63% versus 20% for blocked practice on a test one week later."
          }
        ]
      },
      {
        "id": "focus-and-practice",
        "title": "Focused vs. Diffuse & Deliberate Practice",
        "summary": "Focused and diffuse thinking, working memory's limits, and what actually makes practice build expertise.",
        "cards": [
          {
            "type": "intro",
            "title": "Dalí's Key Trick",
            "body": "Salvador Dalí napped holding a heavy key over a metal plate. As sleep loosened his grip, the clang woke him — and he'd capture whatever his drifting mind had served up. Thomas Edison did the same with steel balls. Both were exploiting a real switch in the brain, one you can flip without the hardware.",
            "art": "bell"
          },
          {
            "type": "concept",
            "title": "Focused and Diffuse",
            "body": "Your brain alternates between a focused mode — tight, effortful, stepping through known moves — and a diffuse mode, where attention relaxes and far-flung associations connect. Barbara Oakley popularized the terms; neuroscientists see the diffuse side in the brain's default mode network, active precisely when you're 'doing nothing.'",
            "art": "balance"
          },
          {
            "type": "mcq",
            "prompt": "You've been stuck on a problem for 45 minutes, re-trying the same approach. What does the two-mode model recommend?",
            "choices": [
              "Push through — breaks reset your mental progress",
              "Step away; a walk or a shower lets diffuse mode attack it",
              "Reread the problem statement more slowly",
              "Stay at the desk but switch to a similar problem"
            ],
            "answer": 1,
            "explain": "Focused mode keeps circling familiar tracks, including wrong ones. Stepping away hands the problem to the default mode network, which tries looser, wider associations — hence shower solutions."
          },
          {
            "type": "concept",
            "title": "The Four-Chunk Bottleneck",
            "body": "Focused mode runs on working memory, and working memory is tiny. George Miller's famous 1956 estimate was 'seven, plus or minus two' items; Nelson Cowan's modern work puts it closer to four chunks. Experts don't get a bigger container — they pack more into each chunk, the way a chess master reads a whole position as one unit.",
            "art": "layers"
          },
          {
            "type": "truefalse",
            "statement": "Multitasking lets you use working-memory capacity that would otherwise sit idle.",
            "answer": false,
            "explain": "There is no idle capacity — you have about four chunks. So-called multitasking is rapid task-switching, and every switch dumps and reloads working memory, which is why it degrades both tasks."
          },
          {
            "type": "concept",
            "title": "Walks Are Work",
            "body": "Breaks aren't lost time; they're when diffuse mode runs. In Marily Oppezzo and Daniel Schwartz's 2014 Stanford studies, walking boosted creative idea generation by around 60% compared with sitting — even on a treadmill facing a blank wall. When you're stuck, moving isn't quitting; it's processing.",
            "art": "path"
          },
          {
            "type": "reveal",
            "prompt": "Why do so many breakthroughs arrive in the shower, on walks, or just before sleep — and almost never mid-grind?",
            "answer": "Those are low-input states where the default mode network roams. Focused work loads the problem; diffuse states recombine it. The catch: diffuse mode has nothing to work with unless you did the hard focusing first."
          },
          {
            "type": "concept",
            "title": "The Berlin Violinists",
            "body": "In 1993, Anders Ericsson, Ralf Krampe and Clemens Tesch-Römer studied violinists at Berlin's elite music academy. The best had accumulated roughly 10,000 hours of solitary practice by age 20 — thousands more than their merely good peers. But the headline number hid the real finding: it was the kind of hours that separated them.",
            "art": "target"
          },
          {
            "type": "quote",
            "text": "If you never push yourself beyond your comfort zone, you will never improve.",
            "by": "K. Anders Ericsson"
          },
          {
            "type": "concept",
            "title": "The 10,000-Hour Myth",
            "body": "Malcolm Gladwell's 'Outliers' turned Ericsson's data into a slogan: 10,000 hours makes an expert. Ericsson publicly objected. Hours of comfortable repetition just automate your current level — plenty of drivers and doctors plateau for decades. Progress needs deliberate practice: isolate a weakness, work at the edge of ability, get immediate feedback, repeat.",
            "art": "clock"
          },
          {
            "type": "mcq",
            "prompt": "A pianist plays her favorite polished pieces two hours a day for years. What would Ericsson predict?",
            "choices": [
              "She'll steadily improve — hours of practice are hours of practice",
              "She'll improve as long as she stays motivated",
              "She'll decline from repetitive strain",
              "She'll plateau: comfortable repetition automates skill but doesn't extend it"
            ],
            "answer": 3,
            "explain": "Deliberate practice targets specific weaknesses just beyond current ability, with immediate feedback. Comfortable repetition merely automates the current level — which is why years of experience alone don't produce expertise."
          },
          {
            "type": "recap",
            "title": "Recap: Focus, Wander, Stretch",
            "points": [
              "Focused mode loads the problem; diffuse mode (the default network) recombines it. Grind first, then step away.",
              "Working memory caps near four chunks; expertise grows chunk size, not capacity.",
              "Walking raised creative idea generation about 60% in Oppezzo and Schwartz's Stanford studies.",
              "Experts are made by deliberate practice — edge-of-ability, feedback-rich work — not by raw hours."
            ]
          }
        ],
        "review": [
          {
            "front": "What is diffuse mode and when does it run?",
            "back": "A relaxed, associative processing state tied to the default mode network; it runs on walks, in showers, near sleep — after focused work loads the problem."
          },
          {
            "front": "What is working memory's real capacity?",
            "back": "About four chunks (Cowan, 2001), not Miller's seven. Experts expand chunk size, not the container."
          },
          {
            "front": "What defines deliberate practice, per Ericsson?",
            "back": "Effortful work at the edge of ability on specific weaknesses, with immediate feedback — not comfortable repetition."
          },
          {
            "front": "Why is the 10,000-hour rule misleading?",
            "back": "Gladwell's slogan kept the hour count and dropped the mechanism: without deliberate practice, hours of repetition just plateau."
          }
        ]
      }
    ]
  },
  {
    "id": "persuasion",
    "title": "The Art of Persuasion",
    "tagline": "See the levers of influence before they're pulled on you.",
    "category": "Communication",
    "description": "Reciprocity, commitment, social proof, authority, liking, unity, scarcity — the seven levers that move human beings, taught through the landmark studies behind them. Learn to pull them ethically, and to spot them instantly when they're pulled on you.",
    "lessons": [
      {
        "id": "reciprocity-commitment",
        "title": "Gifts, Debts, and Promises",
        "summary": "Why tiny gifts and small yeses turn into big commitments — and how to owe nothing to a tactic.",
        "cards": [
          {
            "type": "intro",
            "title": "The Ten-Cent Trap",
            "body": "In 1971, psychologist Dennis Regan had a stranger named Joe buy some study participants a Coke — unasked. Later, Joe sold raffle tickets. The Coke recipients bought twice as many as everyone else, whether they liked Joe or not. Cost of the Coke: a dime. That dime is the subject of this lesson.",
            "art": "seed"
          },
          {
            "type": "concept",
            "title": "The Rule of Reciprocity",
            "body": "Every human culture trains its members to repay what they receive. The rule works with uninvited gifts, tiny gifts, gifts from people we dislike — and it can trigger repayments far larger than the trigger. Regan's dime returned, on average, fifty cents in raffle tickets. Sociologist Alvin Gouldner surveyed cultures and found the norm everywhere.",
            "art": "balance"
          },
          {
            "type": "reveal",
            "prompt": "Why does your restaurant check arrive with a mint — and why do the best servers deliver it in two acts?",
            "answer": "In a 2002 study led by David Strohmetz, one mint with the check raised tips about 3%. Two mints: 14%. One mint, a pause, then a return — 'for you nice people, an extra one' — 23%. A gift works; a personal, unexpected gift works several times harder."
          },
          {
            "type": "example",
            "title": "The Free Sample Industry",
            "body": "Supermarket samples aren't just previews — the smiling attendant and the toothpick make it awkward to walk away without buying. Amway perfected the move with the BUG: a free basket of products left at your home 'for a few days, no obligation.' By the time the rep returned, customers had used the shampoo, felt the debt, and ordered heavily.",
            "art": "key"
          },
          {
            "type": "concept",
            "title": "Door-in-the-Face",
            "body": "Ask for something outrageous, get refused, then 'retreat' to what you actually wanted. Your concession reads as a gift, and the rule demands repayment — and the only currency at hand is a yes. Cialdini tested it in 1975: 17% of students agreed to chaperone kids at the zoo. When he first asked for two years of weekly volunteering, zoo agreement hit 50%.",
            "art": "mountain"
          },
          {
            "type": "mcq",
            "prompt": "A charity calls: 'Would you host a fundraiser dinner for 30 people?' You decline. 'Understandable — could you just donate $25?' What just happened?",
            "choices": [
              "Foot-in-the-door: a small ask paving the way for bigger ones",
              "Door-in-the-face: the retreat is a concession you'll feel pressed to match",
              "Social proof: implying that other supporters already said yes",
              "Anchoring alone: $25 merely feels small next to a dinner for 30"
            ],
            "answer": 1,
            "explain": "The retreat from a large request is door-in-the-face, and its engine is reciprocity: they conceded, so you feel you must too. Contrast helps ($25 looks tiny after a dinner), but Cialdini found concession-driven compliers also follow through more and volunteer again."
          },
          {
            "type": "concept",
            "title": "Commitment and Consistency",
            "body": "Once we take a stand, we bend our behavior to match it — especially when the commitment was active, public, and felt voluntary. Consistency is a social asset (flip-floppers pay a price), so we defend even tiny positions. Persuaders know it: get someone to say, write, or do a small thing, and the big thing follows on its own.",
            "art": "anchor"
          },
          {
            "type": "example",
            "title": "The Ugly Billboard Study",
            "body": "Palo Alto, 1966. Freedman and Fraser asked homeowners to host a huge, badly lettered DRIVE CAREFULLY sign on their lawns. 17% said yes. But among those who had accepted a three-inch safe-driving sign two weeks earlier, 76% agreed. The tiny sign had quietly rewritten their self-image: I'm the kind of person who does things for road safety.",
            "art": "ladder"
          },
          {
            "type": "truefalse",
            "statement": "Commitments made in private bind about as strongly as ones made in front of others.",
            "answer": false,
            "explain": "Public stands are defended hardest. In Thomas Moriarty's 1975 beach study, 19 of 20 sunbathers who had agreed to 'watch my things' chased a staged radio thief — versus 4 of 20 who hadn't been asked."
          },
          {
            "type": "quote",
            "text": "A foolish consistency is the hobgoblin of little minds, adored by little statesmen and philosophers and divines.",
            "by": "Ralph Waldo Emerson"
          },
          {
            "type": "example",
            "title": "The Lowball",
            "body": "A car dealer offers a killer price. You commit — then the deal quietly worsens: paperwork 'errors,' a manager's veto. You buy anyway, because the commitment outlived its reason. In Cialdini's 1978 test, fewer than a third of students agreed to a 7 a.m. experiment when told the hour upfront. Asked to commit before hearing the time: 56% — and nearly all showed up.",
            "art": "clock"
          },
          {
            "type": "reveal",
            "prompt": "The reciprocity rule is ancient and automatic. How do you escape its pull without refusing every kindness?",
            "answer": "Cialdini's fix: accept gifts as gifts — but the moment one is revealed as a tactic, relabel it. A sales device is not a favor, and the rule doesn't oblige repayment of tricks. You owe reciprocity to gifts, not to marketing."
          },
          {
            "type": "recap",
            "title": "Keep This",
            "points": [
              "Gifts create debts: a ten-cent, uninvited Coke doubled raffle-ticket sales in Regan's 1971 study — liking not required.",
              "Door-in-the-face: big ask, refusal, retreat. The concession obligates a yes (17% → 50% in the zoo study).",
              "Foot-in-the-door: small yeses rewrite self-image; a 3-inch sign made 76% accept an ugly billboard.",
              "Commitments bind hardest when active, public, and voluntary — and they survive the removal of their reason (the lowball).",
              "Defense: accept gifts, but relabel tactics as tactics. You owe nothing to a sales device."
            ]
          }
        ],
        "review": [
          {
            "front": "In Regan's 1971 Coke study, what did a 10-cent unsolicited gift do?",
            "back": "Roughly doubled raffle-ticket purchases — and worked whether or not people liked the giver. Reciprocity doesn't need liking."
          },
          {
            "front": "What is the door-in-the-face technique?",
            "back": "Big ask, expected refusal, retreat to the real ask. The concession triggers reciprocity — Cialdini's zoo study jumped from 17% to 50%."
          },
          {
            "front": "What is the foot-in-the-door effect?",
            "back": "A small yes shifts self-image, so a big related ask succeeds later. Freedman & Fraser: 17% vs 76% agreement to host a huge billboard."
          },
          {
            "front": "Why do lowball offers still close after the deal worsens?",
            "back": "The commitment outlives its original reason — people grow new justifications and stick with the choice they already made."
          }
        ]
      },
      {
        "id": "proof-authority",
        "title": "The Crowd and the Uniform",
        "summary": "Why crowds and lab coats steer us — and when the crowd is just as lost as you are.",
        "cards": [
          {
            "type": "intro",
            "title": "The Laugh You Didn't Choose",
            "body": "Ask anyone: canned laughter is irritating, obviously fake, and a little insulting. Yet television kept using it for decades, because experiments kept finding the same thing — laugh tracks make audiences laugh longer, laugh more often, and rate the material as funnier. And the effect is strongest for the worst jokes. Your denial is not data.",
            "art": "bell"
          },
          {
            "type": "concept",
            "title": "Social Proof",
            "body": "When we're unsure what to do, we treat other people's behavior as evidence — usually a decent shortcut, which is exactly why it's exploitable. The principle bites hardest under two conditions: uncertainty (we can't judge for ourselves) and similarity (the crowd looks like us). Canned laughter is a counterfeit crowd, telling your brain the joke landed.",
            "art": "network"
          },
          {
            "type": "truefalse",
            "statement": "Laugh tracks improve good jokes the most — they amplify humor that's already there.",
            "answer": false,
            "explain": "The lift is biggest for weak material — social proof does its heaviest lifting where real evidence is thinnest. Generalize that: the harder a claim is to check, the more its popularity is doing the persuading."
          },
          {
            "type": "example",
            "title": "Towels, Stars, and Bestseller Tags",
            "body": "In a 2008 hotel study, Goldstein, Cialdini, and Griskevicius rewrote the towel-reuse card. The standard eco-appeal did fine; 'most guests reuse their towels' beat it; 'most guests in this room reused theirs' won outright. The closer the crowd, the stronger the pull — the same physics behind star ratings, bestseller tags, and 'customers also bought.'",
            "art": "wave"
          },
          {
            "type": "concept",
            "title": "Pluralistic Ignorance",
            "body": "In an ambiguous emergency, everyone checks everyone else — while carefully looking calm. So each person sees a room of calm people and concludes nothing is wrong. Latané and Darley piped smoke into a waiting room in 1968: alone, 75% of people reported it. Sitting with two impassive plants, 10% did. The group wasn't heartless; it was misinformed by itself.",
            "art": "eye"
          },
          {
            "type": "mcq",
            "prompt": "A fire alarm sounds in a crowded open-plan office. Nobody stands up. What's the pluralistic-ignorance reading?",
            "choices": [
              "People far from the exits feel less responsible for reacting",
              "Alarm fatigue: repeated drills have taught everyone to tune it out",
              "Each person reads everyone else's calm as evidence it's nothing — while performing the same calm",
              "Employees are waiting for a manager to move first"
            ],
            "answer": 2,
            "explain": "Everyone is both audience and unwitting actor, so the group manufactures its own false evidence of safety. One visible first mover — you, standing up and walking out — usually breaks the spell for the room."
          },
          {
            "type": "concept",
            "title": "The Milgram Baseline",
            "body": "Yale, 1961–62. Stanley Milgram's volunteers, told to punish a 'learner' with escalating shocks, kept going past screams and then silence — in the baseline condition, 26 of 40 (65%) reached the final 450-volt switch. They weren't sadists: most protested, sweated, and begged to stop. They obeyed a calm man in a lab coat saying the experiment must continue.",
            "art": "pyramid"
          },
          {
            "type": "quote",
            "text": "The disappearance of a sense of responsibility is the most far-reaching consequence of submission to authority.",
            "by": "Stanley Milgram"
          },
          {
            "type": "example",
            "title": "The Uniform Effect",
            "body": "Leonard Bickman, 1974: a man on the street orders passersby to pick up litter or hand a stranger a dime for a parking meter. In street clothes, most refused; dressed as a security guard, most complied — even after he'd walked away. And in 1966, Charles Hofling found 21 of 22 hospital nurses ready to give an obvious drug overdose because a phone voice said 'doctor.'",
            "art": "shield"
          },
          {
            "type": "reveal",
            "prompt": "Milgram ran many variations. What change collapsed obedience most dramatically?",
            "answer": "Distance and dissent. When the experimenter phoned in his orders, obedience fell to about 20%. When two experimenters disagreed with each other, everyone stopped. Authority needs presence and a united front — remove either, and people become themselves again."
          },
          {
            "type": "concept",
            "title": "When the Crowd Is Lost Too",
            "body": "Social proof fails in two ways. Sometimes the evidence is counterfeit: bought reviews, botted follower counts, laugh tracks. Sometimes it's circular: everyone is copying everyone, and nobody holds real information — a line of tourists following tourists. Before you follow, ask the only question that matters: does this crowd actually know something I don't?",
            "art": "compass"
          },
          {
            "type": "mcq",
            "prompt": "You're picking a restaurant in a city you've never visited. When is the long line outside most likely to mislead you?",
            "choices": [
              "When the restaurant is expensive",
              "When the line is fellow tourists — similar to you, but sharing your ignorance",
              "When the line is local regulars",
              "Never: long lines are reliable evidence, because feet don't lie"
            ],
            "answer": 1,
            "explain": "Similarity strengthens the pull, but pull isn't proof: fellow tourists may be a feedback loop started by one guidebook. Locals in line actually hold the information you lack."
          },
          {
            "type": "recap",
            "title": "Keep This",
            "points": [
              "Social proof rules under uncertainty and similarity — canned laughter works best on the worst jokes.",
              "'Guests in this room reused their towels' beat the eco-appeal: the nearer the norm, the harder it pulls.",
              "Pluralistic ignorance: everyone performs calm, everyone reads calm — 75% reported smoke alone, 10% in a passive group.",
              "Milgram's baseline: 65% obeyed to 450 volts; obedience collapsed when authority was distant or divided.",
              "Symbols aren't credentials: a guard's uniform (Bickman) and a phoned-in 'doctor' (Hofling) commanded real obedience. Check the substance."
            ]
          }
        ],
        "review": [
          {
            "front": "In Latané and Darley's 1968 smoke-filled room, how did company change reporting?",
            "back": "Alone, 75% reported the smoke; sitting with two passive confederates, only 10% did."
          },
          {
            "front": "What is pluralistic ignorance?",
            "back": "In ambiguity, everyone performs calm while scanning others — so each person reads the group's calm as evidence that nothing is wrong."
          },
          {
            "front": "What was Milgram's baseline obedience result?",
            "back": "65% (26 of 40) delivered the maximum 450-volt shock; obedience plunged when the authority was distant or contradicted by another authority."
          },
          {
            "front": "What did Bickman's uniform study and Hofling's nurse study show?",
            "back": "Mere symbols of authority — a guard's uniform, the word 'doctor' on a phone — produced compliance without any real credentials behind them."
          }
        ]
      },
      {
        "id": "liking-unity",
        "title": "Friends, Tribes, and Tupperware",
        "summary": "Similarity, flattery, cooperation — and the deeper pull of being 'one of us.'",
        "cards": [
          {
            "type": "intro",
            "title": "The Party Is the Product",
            "body": "Tupperware's genius was never the burp seal. It was the party: a hostess invites her friends, earns a cut, and lets friendship do the selling. Researchers Frenzen and Davis found the strength of the social tie was twice as likely to determine a purchase as preference for the product itself. You aren't buying a bowl. You're buying from Ruth.",
            "art": "orbit"
          },
          {
            "type": "concept",
            "title": "The Liking Principle",
            "body": "We say yes to people we like, and we like people for learnable reasons: they resemble us, they compliment us, they cooperate with us toward shared goals. None of this requires deception — but every lever can be pulled on cue. The halo effect stacks on top: we unconsciously read attractive people as smarter, kinder, and more honest than they've shown.",
            "art": "dialog"
          },
          {
            "type": "mcq",
            "prompt": "Per Frenzen and Davis, what best predicted whether a Tupperware party guest actually bought something?",
            "choices": [
              "How much she liked the products themselves",
              "The size of the discount offered that night",
              "The strength of her social tie to the hostess",
              "How many other guests she saw buying"
            ],
            "answer": 2,
            "explain": "The social bond carried about twice the weight of product preference. The ask travels down the relationship, not the catalog — guests report feeling they'd be letting the hostess down by leaving empty-handed."
          },
          {
            "type": "concept",
            "title": "Mirrors Everywhere",
            "body": "We like people who are like us — in dress, background, even sentence rhythm. In a 2003 Dutch study by Rick van Baaren, waitresses who repeated orders back verbatim, in the customer's own words, earned tips roughly 70% larger than those who paraphrased. Salespeople are trained to 'discover' shared hometowns and hobbies. Coincidence is a technique.",
            "art": "mirror"
          },
          {
            "type": "truefalse",
            "statement": "Compliments only build liking when the target believes they're accurate.",
            "answer": false,
            "explain": "In a 1978 experiment by Drachman, deCarufel, and Insko, men liked a flatterer who wanted a favor even when the praise was plainly untrue — pure praise beat accurate mixed feedback. So watch timing, not sincerity: the tell is praise that arrives just before a request."
          },
          {
            "type": "example",
            "title": "Robbers Cave",
            "body": "1954: Muzafer Sherif split 22 boys at an Oklahoma summer camp into Rattlers and Eagles. Competition alone bred raids, burned flags, and fistfights. Mixing the groups at meals didn't help. What worked was shared trouble: a 'failed' water supply and a truck that 'broke down,' fixable only together. Cooperation toward a common goal turned enemies into friends.",
            "art": "flame"
          },
          {
            "type": "example",
            "title": "The Jigsaw Classroom",
            "body": "Austin, Texas, 1971: newly desegregated classrooms were boiling. Elliot Aronson's fix made each student the sole owner of one piece of the lesson — classmates had to teach and learn from each other to pass. Cross-ethnic friendships formed, minority students' grades rose, and absences fell. Same kids, same school; the only change was needing one another.",
            "art": "puzzle"
          },
          {
            "type": "quote",
            "text": "You can make more friends in two months by becoming interested in other people than you can in two years by trying to get other people interested in you.",
            "by": "Dale Carnegie"
          },
          {
            "type": "concept",
            "title": "Unity: From Like Me to Of Me",
            "body": "In 2016, Cialdini added a seventh principle. Unity isn't resemblance; it's shared identity — family, hometown, regiment, faith, team. 'We' language moves people in ways mere similarity can't: kin terms in fundraising letters, 'brothers and sisters' in movements, alumni calls made by fellow alumni. The persuader wants you asking: what would one of us do?",
            "art": "bridge"
          },
          {
            "type": "reveal",
            "prompt": "After a football Saturday, Cialdini could tell from Monday's campus whether the team had won. How?",
            "answer": "School sweatshirts bloomed after victories. In his 1976 'basking in reflected glory' studies across seven universities, students wore team gear more after wins — and said 'we won' but 'they lost.' Identity fuses with the group, selectively."
          },
          {
            "type": "mcq",
            "prompt": "Which appeal runs on unity, not mere similarity?",
            "choices": [
              "'You and I both love trail running'",
              "'That's a brilliant question, by the way'",
              "'Nine hundred people bought one this week'",
              "'We both served in the 101st — airborne looks after its own'"
            ],
            "answer": 3,
            "explain": "Similarity says 'we're alike'; unity says 'we're the same we' — a shared identity like family, unit, or faith, and the deepest of the levers. The others are similarity, flattery, and social proof."
          },
          {
            "type": "concept",
            "title": "Separate the Person From the Pitch",
            "body": "Cialdini's defense against liking isn't suspicion of everyone — it's a tripwire. Notice when you've come to like a requester unusually fast for the time you've spent together. That's the cue to split two judgments: the person, and the proposal. Would you take this exact deal from someone you'd never met? Decide on that answer, not on the friendship.",
            "art": "fork"
          },
          {
            "type": "recap",
            "title": "Keep This",
            "points": [
              "Liking runs on similarity, compliments, and cooperation — and flattery works even when it's transparently untrue.",
              "Tupperware's engine: the social tie predicted purchases about twice as strongly as product preference.",
              "Cooperation converts: Robbers Cave rivals and Aronson's jigsaw classrooms bonded through shared goals — contact alone had failed.",
              "Unity beats similarity: 'one of us' (family, unit, team) moves people more than 'like us.'",
              "Defense: liking someone suspiciously fast? Judge the deal as if it came from a stranger."
            ]
          }
        ],
        "review": [
          {
            "front": "What best predicted Tupperware party purchases (Frenzen & Davis)?",
            "back": "The strength of the guest's social tie to the hostess — about twice the weight of her preference for the product itself."
          },
          {
            "front": "What ended the hostility at Robbers Cave?",
            "back": "Superordinate goals — problems (water supply, stuck truck) the rival groups could only solve together. Mere contact at meals had failed."
          },
          {
            "front": "How does Aronson's jigsaw classroom create liking?",
            "back": "Each student holds one essential piece of the lesson, so classmates must teach and rely on each other — cooperation builds bonds and raises grades."
          },
          {
            "front": "What's the difference between liking and unity?",
            "back": "Liking: 'you're like me' (similarity, compliments, cooperation). Unity: 'you're one of us' — shared identity like family, unit, or team. Unity runs deeper."
          }
        ]
      },
      {
        "id": "scarcity-defense",
        "title": "Running Out (and Fighting Back)",
        "summary": "Why running out makes us want it — and the exact moves that break the spell.",
        "cards": [
          {
            "type": "intro",
            "title": "Two Jars of Cookies",
            "body": "1975: Stephen Worchel offered people a chocolate-chip cookie from a jar of ten, or an identical cookie from a jar of two. Same recipe. The scarce cookies were rated more desirable and worth more money — though, tellingly, not better-tasting. Scarcity inflates wanting. It does nothing for having. Every countdown timer on the internet is built on that gap.",
            "art": "hourglass"
          },
          {
            "type": "concept",
            "title": "Why Less Means More",
            "body": "Two engines drive scarcity. First, loss: in Kahneman and Tversky's experiments, losses loomed roughly twice as large as equal gains — and 'last chance' reframes a purchase as avoiding a loss. Second, shortcut logic: rare things are usually valuable, so we read rarity itself as quality, even when the rarity is a marketing decision.",
            "art": "coin"
          },
          {
            "type": "reveal",
            "prompt": "Worchel found plain scarcity wasn't the strongest condition. What made people want the cookies most?",
            "answer": "Cookies that became scarce while they watched — a full jar swapped for a near-empty one — and became scarce because others wanted them. New scarcity beats constant scarcity, and demand-driven scarcity beats accident. 'Selling fast' is this study, weaponized."
          },
          {
            "type": "concept",
            "title": "Reactance: The Toddler Reflex",
            "body": "Jack Brehm's 1966 theory of reactance: threaten a freedom and we want it back — hard. Two-year-old boys in a 1977 study beelined for the toy behind a tall plexiglass barrier over the identical toy beside it. When Dade County banned phosphate detergents in 1972, Miamians smuggled and stockpiled them — and rated them better than Tampa shoppers, who could buy freely, did.",
            "art": "flame"
          },
          {
            "type": "example",
            "title": "The FOMO Machine",
            "body": "'Only 2 rooms left.' 'In 12 other carts right now.' Drops, invite-only apps, streak counters, midnight deadlines. Each engineers one of three ingredients: limited supply, limited time, or rival buyers. Rivals bite hardest — car dealers deliberately schedule interested buyers at the same hour, because a contested item stops being evaluated and starts being won.",
            "art": "clock"
          },
          {
            "type": "mcq",
            "prompt": "Which pitch is running the strongest version of scarcity, per Worchel's findings?",
            "choices": [
              "'Sale ends Sunday'",
              "'Limited edition since launch'",
              "'Just dropped from 8 in stock to 2 — and 12 people are viewing it now'",
              "'Free returns, always'"
            ],
            "answer": 2,
            "explain": "It stacks Worchel's two amplifiers: newly scarce (dropping before your eyes) and scarce because of rival demand. A perpetual 'limited edition' is the weakest form — constant scarcity is just how things are."
          },
          {
            "type": "concept",
            "title": "Persuasion or Manipulation?",
            "body": "Cialdini's ethical test has three parts. Is it true? (The deadline exists; the reviews are real.) Is it relevant? (The expert's authority is in this field, not just a lab coat.) Does it point people toward something genuinely good for them? Pass all three and you're a detective of influence, surfacing real evidence. Fail one and you're a smuggler, importing fake evidence.",
            "art": "balance"
          },
          {
            "type": "quote",
            "text": "I can resist everything except temptation.",
            "by": "Oscar Wilde"
          },
          {
            "type": "concept",
            "title": "Name It to Tame It",
            "body": "The principles work automatically — that's the whole trick. Labeling breaks the automation. Say what's happening, in words: 'that's a countdown timer,' 'that's door-in-the-face,' 'this urgency is manufactured.' Naming converts you from participant to observer, and the arousal itself becomes your alarm: a surge of urgency is information about the tactic, not the product.",
            "art": "lens"
          },
          {
            "type": "truefalse",
            "statement": "A sudden rush of urgency during a sale is a signal to decide fast, before the window closes.",
            "answer": false,
            "explain": "The rush is the tactic working, which makes it your cue to slow down. Worchel's cookies are the reminder: scarcity inflated wanting, not tasting — the item does nothing more just because it's about to sell out."
          },
          {
            "type": "concept",
            "title": "The Fully-Stocked Test",
            "body": "Two questions dissolve most scarcity plays. First: do I want this for what it does, or for the win of getting it? Utility survives the sellout; trophies don't. Second: would I buy at this price if the shelf were full? Then verify — reopen the page in a private browser window and watch whether the 'expiring' countdown quietly resets. Fake timers usually do.",
            "art": "target"
          },
          {
            "type": "mcq",
            "prompt": "A timeshare pitch hits you with free breakfast, 'today only' pricing, 'most guests upgrade,' and a host from your hometown. Best first defense?",
            "choices": [
              "Refuse the free breakfast so you owe them nothing",
              "Silently name each tactic as it lands: reciprocity, scarcity, social proof, liking",
              "Decide quickly, before the pressure has time to build",
              "Counter with hardball negotiation tactics of your own"
            ],
            "answer": 1,
            "explain": "Naming re-engages deliberate judgment and works against every principle at once. You can even keep the breakfast — relabeled as a sales expense rather than a gift, it obligates nothing."
          },
          {
            "type": "recap",
            "title": "Keep This",
            "points": [
              "Scarcity inflates wanting, not having: Worchel's scarce cookies were rated more valuable — not tastier.",
              "The strongest form is newly scarce plus demanded by rivals; 'selling fast' stacks both.",
              "Reactance (Brehm, 1966): threatened freedoms become cravings — the engine behind bans, drops, and deadlines.",
              "Ethical influence is true, relevant, and genuinely good for the audience — a detective of evidence, not a smuggler.",
              "Defense: name the tactic, treat urgency as an alarm to slow down, and ask — would I buy this fully stocked?"
            ]
          }
        ],
        "review": [
          {
            "front": "What did Worchel's 1975 cookie-jar study show?",
            "back": "Cookies from the near-empty jar were rated more desirable and valuable — but not better-tasting. Scarcity inflates wanting, not enjoying."
          },
          {
            "front": "Which kind of scarcity is most potent, per Worchel?",
            "back": "Newly scarce (abundant a moment ago) and scarce because of others' demand — the basis of 'selling fast' and live-viewer counters."
          },
          {
            "front": "What is psychological reactance?",
            "back": "Brehm (1966): when a freedom or option is threatened, we want it more and push back — toddlers behind barriers, hoarded banned detergent."
          },
          {
            "front": "How do you defuse an influence tactic in the moment?",
            "back": "Name it ('that's manufactured urgency'), treat the rush as an alarm to slow down, and ask if you'd want the item at that price fully stocked."
          }
        ]
      }
    ]
  },
  {
    "id": "logical-fallacies",
    "title": "Logical Fallacies",
    "tagline": "Spot broken arguments before they break you.",
    "category": "Critical Thinking",
    "description": "The classic ways arguments go wrong — from ad hominem to motte-and-bailey — and how to spot them in debates, headlines, ads, and your own head.",
    "lessons": [
      {
        "id": "ad-hominem-strawman",
        "title": "The Man and the Straw Man",
        "summary": "Ad hominem and straw man both dodge the real argument — learn to spot the dodge and answer with a steelman instead.",
        "cards": [
          {
            "type": "intro",
            "title": "The Ape's Grandmother",
            "body": "Oxford, 1860. Bishop Samuel Wilberforce reportedly asked Thomas Huxley whether he claimed descent from an ape on his grandfather's side or his grandmother's. The crowd roared. Notice what the bishop didn't do: touch Darwin's evidence. Mockery is faster than rebuttal, and it still wins rooms today.",
            "art": "flame"
          },
          {
            "type": "concept",
            "title": "Attack the Claim, Not the Claimant",
            "body": "An ad hominem argument rejects a claim by attacking the person making it: their character, motives, or tribe. It feels devastating and proves nothing, because a claim's truth doesn't depend on who says it. A liar can state the time correctly. A saint can get the facts wrong.",
            "art": "target"
          },
          {
            "type": "mcq",
            "prompt": "A senator argues a tax bill will widen the deficit. Which reply is an ad hominem?",
            "choices": [
              "'Your projections rely on outdated growth numbers.'",
              "'You flip-flopped on this exact issue in 2019, so we can ignore you.'",
              "'The Congressional Budget Office disagrees with your math.'"
            ],
            "answer": 1,
            "explain": "Only the flip-flop jab dodges the argument to attack the arguer. The other replies might be mistaken, but they engage the claim — which is the whole game."
          },
          {
            "type": "concept",
            "title": "When the Messenger Matters",
            "body": "Character isn't always off-limits. If a claim rests on someone's testimony — 'trust me, I saw it' — their honesty record is real evidence. The fallacy kicks in when the claim rests on public reasons and you attack the person anyway. And hypocrisy ('you smoke too!') never falsifies the advice: that's the tu quoque variant.",
            "art": "balance"
          },
          {
            "type": "truefalse",
            "statement": "Noting that a study's author is funded by the industry her research favors refutes the study.",
            "answer": false,
            "explain": "A conflict of interest justifies extra scrutiny, not dismissal. The study stands or falls on its methods and data; motive alone settles nothing."
          },
          {
            "type": "concept",
            "title": "The Straw Man",
            "body": "A straw man swaps your opponent's actual position for a flimsier lookalike, then knocks that down. 'Schools should assign less homework' becomes 'you don't care whether kids learn.' The tell: the rebuttal is easier than any real person's view deserves. First the distortion, then the demolition.",
            "art": "mirror"
          },
          {
            "type": "example",
            "title": "Nobody Said We Came From Monkeys",
            "body": "'Evolutionists say a monkey gave birth to a human' is a straw man of common descent, which actually claims humans and other apes share distant ancestors. Notice the pattern: the distorted version is cartoonish and easy to laugh at. When a position sounds idiotic, first check whether anyone actually holds it.",
            "art": "book"
          },
          {
            "type": "reveal",
            "prompt": "Before rebutting someone, try stating their view so well they'd say 'exactly.' What is this practice called — and why does it help you, not just them?",
            "answer": "Steelmanning: engaging the strongest version of a position, not the weakest. If you can beat the steel man, your case is solid; if you can't, you found that out cheap."
          },
          {
            "type": "concept",
            "title": "Steelmanning",
            "body": "In Intuition Pumps (2013), Daniel Dennett relays Anatol Rapoport's rules for criticism: restate your opponent's view so vividly they say 'I wish I'd put it that way,' list your points of agreement, mention what you learned — and only then rebut. You earn a hearing, and you stress-test your own case first.",
            "art": "shield"
          },
          {
            "type": "quote",
            "text": "He who knows only his own side of the case, knows little of that.",
            "by": "John Stuart Mill"
          },
          {
            "type": "mcq",
            "prompt": "Your colleague says meetings should be shorter. You reply, 'So you think communication is worthless?' Which fallacy is this?",
            "choices": [
              "Ad hominem — attacking her character",
              "Straw man — swapping her claim for an extreme version",
              "Tu quoque — calling her a hypocrite"
            ],
            "answer": 1,
            "explain": "She said shorter, not worthless. Inflating a moderate claim into an absurd one is the classic straw man — and it invites her to return the favor."
          },
          {
            "type": "recap",
            "title": "Argue With the Argument",
            "points": [
              "Ad hominem rejects a claim by attacking its source; truth doesn't care who's talking.",
              "Character counts only when the claim rests on testimony or trust, not public evidence.",
              "A straw man rebuts a distorted, weaker version of the real position.",
              "If an opposing view sounds idiotic, check whether anyone actually holds it.",
              "Steelman first: restate the view so well your opponent says 'exactly' — then rebut."
            ]
          }
        ],
        "review": [
          {
            "front": "What makes an argument ad hominem?",
            "back": "It rejects a claim by attacking the person — character, motives, tribe — instead of engaging the claim's evidence."
          },
          {
            "front": "When is questioning someone's character NOT fallacious?",
            "back": "When the claim rests on their testimony or trustworthiness — credibility is then genuine evidence."
          },
          {
            "front": "What is a straw man?",
            "back": "Misrepresenting a position as a weaker, more extreme version, then refuting that instead of the real view."
          },
          {
            "front": "What is steelmanning?",
            "back": "Rebutting the strongest version of an opposing view: restate it so well the holder agrees, then critique that."
          }
        ]
      },
      {
        "id": "false-dilemma-slippery-slope",
        "title": "Two Doors and a Slope",
        "summary": "Either/or framings hide the menu, and slope arguments need mechanisms — learn which binaries and slopes are real.",
        "cards": [
          {
            "type": "intro",
            "title": "With Us or Against Us",
            "body": "'Either you are with us, or you are with the terrorists,' George W. Bush told Congress in September 2001. Effective rhetoric — and a template. Collapse a crowded field of options into two, make one unthinkable, and the audience walks itself to your door. This lesson is about noticing the missing doors.",
            "art": "fork"
          },
          {
            "type": "concept",
            "title": "The False Dilemma",
            "body": "A false dilemma (or false dichotomy) presents two options as if they exhaust the possibilities. 'Buy now or pay more forever.' 'Love it or leave it.' It borrows the authority of logic — a real either/or, like a switch that's on or off — for situations that are actually dials, spectrums, or whole menus.",
            "art": "layers"
          },
          {
            "type": "mcq",
            "prompt": "'Either we cut the arts budget or the city goes bankrupt.' What's the fastest way to test this claim?",
            "choices": [
              "Ask whether those two options are really the only ones",
              "Ask who benefits from the cut",
              "Accept it — a budget is either balanced or it isn't"
            ],
            "answer": 0,
            "explain": "A dilemma is only as strong as its 'either.' Most budgets are dials, not switches — hunting for a third option usually turns up several."
          },
          {
            "type": "concept",
            "title": "Some Dilemmas Are Real",
            "body": "Not every binary is a trick. Some choices are genuinely exhaustive: a number is either prime or it isn't; you signed the contract or you didn't. The test is exhaustiveness — do the options cover every case? 'A or not-A' is airtight. 'A or B' owes you proof that C, D, and E don't exist.",
            "art": "coin"
          },
          {
            "type": "truefalse",
            "statement": "'You're either part of the solution or part of the problem' is logically exhaustive, so it can't be a false dilemma.",
            "answer": false,
            "explain": "It only sounds like 'A or not-A.' You can be irrelevant to a problem, or affect it in mixed ways — rhetorical binaries often wear logical clothing."
          },
          {
            "type": "concept",
            "title": "The Slippery Slope",
            "body": "A slippery-slope argument claims one step leads, link by link, to catastrophe: allow X and we inevitably get Z. The problem isn't predicting consequences — it's asserting the chain for free. Each 'and then' carries a probability below 100%, and multiplied down a long chain, near-certainty thins into maybe.",
            "art": "mountain"
          },
          {
            "type": "example",
            "title": "When the Slope Is Real",
            "body": "Slopes do exist. Legal precedent is a genuine sliding mechanism: courts must treat like cases alike, so today's narrow ruling shapes tomorrow's argument. In a 2003 Harvard Law Review article, Eugene Volokh mapped how small steps really do shift costs, attitudes, and law. The question isn't 'could we slide?' but 'what, exactly, would push us?'",
            "art": "ladder"
          },
          {
            "type": "reveal",
            "prompt": "'If we ban one book from the school library, soon we'll ban hundreds.' What single question turns this from rhetoric into analysis?",
            "answer": "'By what mechanism?' Demand the specific links — precedent, incentives, shifting norms — and how likely each one is. A slope claim without a mechanism is a fear with momentum."
          },
          {
            "type": "concept",
            "title": "The Middle Isn't Sacred Either",
            "body": "Escaping a false dilemma doesn't mean splitting the difference. The argument-to-moderation fallacy assumes truth sits midway between any two positions. If one person says 2+2=4 and another insists it's 6, the answer isn't 5. Sometimes an 'extreme' is simply correct; the middle earns nothing by geography.",
            "art": "balance"
          },
          {
            "type": "mcq",
            "prompt": "'Legalize sports betting and soon it's casinos on every corner, then a nation of addicts.' What would MOST strengthen this argument?",
            "choices": [
              "Delivering it with more conviction",
              "Evidence for each link — what actually happened where betting was legalized",
              "Noting the speaker's financial stake in casinos",
              "Polling showing many people dislike gambling"
            ],
            "answer": 1,
            "explain": "A slope argument is exactly as strong as its chain. Outcomes from comparable places turn a scare story into a forecast you can check."
          },
          {
            "type": "example",
            "title": "The Salesman's Either/Or",
            "body": "Sales trainers teach the 'alternative close': 'Shall we deliver Tuesday or Thursday?' The purchase is presupposed; only details remain on the menu. Political framing runs the same play — 'tough on crime or soft on crime?' skips every option in between. Whoever writes the menu usually wins the meal.",
            "art": "dialog"
          },
          {
            "type": "recap",
            "title": "Count the Doors",
            "points": [
              "False dilemma: two options sold as exhaustive when the menu is longer.",
              "Test the 'either' — only 'A or not-A' is airtight; 'A or B' must prove there's no C.",
              "Slippery slopes need mechanisms (precedent, incentives), not just momentum.",
              "Long causal chains multiply probabilities; every link under 100% thins the whole.",
              "Don't overcorrect: the middle position isn't right by geography."
            ]
          }
        ],
        "review": [
          {
            "front": "What is a false dilemma?",
            "back": "Presenting two options as the only possibilities when others exist — a dial disguised as a switch."
          },
          {
            "front": "When is an either/or framing legitimate?",
            "back": "When the options are logically exhaustive, like 'A or not-A' — they must cover every possible case."
          },
          {
            "front": "What separates a fallacious slippery slope from a reasonable one?",
            "back": "Fallacious ones assert the chain to disaster for free; reasonable ones evidence each link's mechanism and likelihood."
          },
          {
            "front": "What is the argument-to-moderation fallacy?",
            "back": "Assuming truth lies midway between two positions. Sometimes one side is simply right; the middle earns nothing by location."
          }
        ]
      },
      {
        "id": "appeals",
        "title": "Borrowed Credibility",
        "summary": "When borrowed credibility — experts, feelings, crowds, nature, tradition — counts as evidence, and when it's a costume.",
        "cards": [
          {
            "type": "intro",
            "title": "More Doctors Smoke Camels",
            "body": "'More doctors smoke Camels than any other cigarette,' claimed a 1946 ad campaign, complete with white-coated physicians. Authority, popularity, and reassurance in a single image — and wrong about the only thing that mattered. Appeals persuade by borrowing credibility. Your job is to audit the loan.",
            "art": "bell"
          },
          {
            "type": "concept",
            "title": "Renting Credibility",
            "body": "Deferring to experts isn't a fallacy — it's how finite brains navigate a vast world. Appeals to authority go wrong three ways: the expertise is in a different field, the experts genuinely disagree, or the 'authority' is just fame, wealth, or a lab coat. Legitimate appeals cite relevant, current, consensus-backed expertise.",
            "art": "coin"
          },
          {
            "type": "example",
            "title": "The Nobel Disease",
            "body": "Linus Pauling won the 1954 Nobel Prize in Chemistry — then spent decades promoting vitamin C megadoses for colds and cancer, claims controlled trials repeatedly failed to support. Skeptics coined 'Nobel disease' for laureates who roam confidently outside their field. Expertise is narrow. Check that it covers the claim at hand.",
            "art": "brain"
          },
          {
            "type": "truefalse",
            "statement": "Citing the CDC on vaccine safety and citing a famous actor on vaccine safety are both appeals to authority, so they're equally weak.",
            "answer": false,
            "explain": "Relevant, accountable, consensus-backed expertise is genuine evidence; fame is not. The fallacy is appealing to authority that isn't authoritative on the question."
          },
          {
            "type": "concept",
            "title": "Feelings as Evidence",
            "body": "Appeals to emotion — pity, fear, outrage — swap reasons for reactions. Emotion itself isn't the enemy; a true story can be moving and probative at once. The fallacy is when feeling does the work facts can't: the ad selling alarm instead of data, the plea answering 'is it true?' with 'but it's sad.'",
            "art": "wave"
          },
          {
            "type": "example",
            "title": "The Daisy Ad",
            "body": "September 1964: a little girl counts daisy petals, the count morphs into a missile countdown, a mushroom cloud blooms. Lyndon Johnson's 'Daisy' ad aired just once and never named Barry Goldwater — no argument, only dread and a voting reminder. It's still studied because it worked. Fear skips the step where claims get defended.",
            "art": "clock"
          },
          {
            "type": "mcq",
            "prompt": "A charity mailer shows a suffering child and asks for donations. When does this become an appeal-to-emotion fallacy?",
            "choices": [
              "Never — charities are allowed to be moving",
              "Always — arguments should be emotionless",
              "When the feeling substitutes for the factual case, like whether donations actually help",
              "Only if the photograph is staged"
            ],
            "answer": 2,
            "explain": "Emotion pointed at true, relevant facts is honest persuasion. It turns fallacious when the tug replaces the question you should be asking."
          },
          {
            "type": "concept",
            "title": "Fifty Million Frenchmen",
            "body": "Argumentum ad populum: it must be true, because everyone believes it. But majorities once backed geocentrism and leaded gasoline. Popularity tracks marketing, habit, and conformity at least as well as truth — fifty million Frenchmen can, in fact, be wrong. What crowds echo is often just each other.",
            "art": "network"
          },
          {
            "type": "quote",
            "text": "The fact that an opinion has been widely held is no evidence whatever that it is not utterly absurd.",
            "by": "Bertrand Russell"
          },
          {
            "type": "reveal",
            "prompt": "In 1906, Francis Galton collected 787 guesses of an ox's weight at an English county fair. How did the crowd do?",
            "answer": "The middle guess landed within about 1% of the ox's true 1,198 pounds — Galton reported it in Nature. Crowds inform when judgments are independent; ad populum fails when they merely echo."
          },
          {
            "type": "concept",
            "title": "Natural and Ancient",
            "body": "The appeal to nature says natural equals good — but arsenic, botulinum toxin, and smallpox are perfectly natural, while insulin and eyeglasses are not. The appeal to tradition says old equals right — yet 'we've always done it' defended bloodletting for two millennia. Age and naturalness describe a practice; they don't defend it.",
            "art": "seed"
          },
          {
            "type": "mcq",
            "prompt": "'People have eaten this way for centuries' and 'it's 100% natural' both fail as arguments for the same core reason. What is it?",
            "choices": [
              "They cite properties — age, naturalness — that don't track truth or safety",
              "They're appeals to authority in disguise",
              "They're statistically unrepresentative",
              "They commit the post hoc fallacy"
            ],
            "answer": 0,
            "explain": "Both substitute a comfortable attribute for evidence. Arsenic is natural and bloodletting was traditional; the attribute settles nothing either way."
          },
          {
            "type": "recap",
            "title": "Audit the Loan",
            "points": [
              "Deferring to experts is rational when expertise is relevant, current, and consensus-backed.",
              "A credential outside its field is a costume — check that it covers the claim.",
              "Emotion becomes fallacy when feeling substitutes for the factual question.",
              "Popularity tracks conformity as much as truth; independent judgments carry more weight.",
              "'Natural' and 'traditional' are descriptions, not arguments."
            ]
          }
        ],
        "review": [
          {
            "front": "When is citing an authority legitimate?",
            "back": "When the source has relevant expertise, the claim falls inside that expertise, and experts in the field broadly agree."
          },
          {
            "front": "What is argumentum ad populum?",
            "back": "Arguing a claim is true because many believe it. Majorities once backed geocentrism and leaded gasoline."
          },
          {
            "front": "What is the appeal to nature?",
            "back": "Assuming natural means good and artificial means bad. Arsenic is natural; insulin is synthetic."
          },
          {
            "front": "When does emotional persuasion become fallacious?",
            "back": "When the emotion substitutes for evidence — answering 'is it true?' with 'but it's sad' or 'but it's scary.'"
          }
        ]
      },
      {
        "id": "causal-burden-of-proof",
        "title": "The Painted Bullseye",
        "summary": "Untangle sequence from cause, catch bullseyes painted after the fact, and keep the burden of proof where it belongs.",
        "cards": [
          {
            "type": "intro",
            "title": "Nicolas Cage Causes Drownings",
            "body": "From 1999 to 2009, US pool drownings tracked the number of films Nicolas Cage appeared in each year — a correlation Tyler Vigen made famous on his Spurious Correlations site. Nobody blames Cage. But swap in 'screen time' and 'teen depression' and the same graph shape suddenly feels like proof. This lesson is about that feeling.",
            "art": "graph"
          },
          {
            "type": "concept",
            "title": "After, Therefore Because",
            "body": "Post hoc ergo propter hoc — 'after this, therefore because of this.' The rooster crows; the sun rises. You took the remedy Tuesday and felt better Thursday. Sequence feels like causation because causes do come first — but so does everything else that happened earlier. Timing is a clue, never a verdict.",
            "art": "clock"
          },
          {
            "type": "truefalse",
            "statement": "Most colds clear up within about a week on their own — which makes 'I took zinc and got better' weak evidence that zinc works.",
            "answer": true,
            "explain": "Self-limiting illnesses improve regardless, so nearly any remedy looks effective post hoc. Control groups exist to show what would have happened anyway."
          },
          {
            "type": "concept",
            "title": "Four Suspects Behind Every Correlation",
            "body": "When A and B move together, interrogate four suspects: A causes B, B causes A, some third thing C drives both, or chance made the match. Ice cream sales correlate with drownings; the culprit is summer. Randomized experiments exist precisely to isolate the first suspect. Without one, hold your verdict loosely.",
            "art": "network"
          },
          {
            "type": "mcq",
            "prompt": "Cities that send more firefighters to a blaze end up with more fire damage. Best explanation?",
            "choices": [
              "Firefighters cause the damage",
              "Bigger fires summon more firefighters and cause more damage — a third factor drives both",
              "Pure coincidence",
              "The data must be fake"
            ],
            "answer": 1,
            "explain": "Fire size is the classic confounder: it pulls in more crews and burns more property. Third variables and reverse causation explain most eerie correlations."
          },
          {
            "type": "concept",
            "title": "The Texas Sharpshooter",
            "body": "A Texan sprays a barn with bullets, then paints a bullseye around the tightest cluster. The Texas sharpshooter fallacy does this with data: test enough patterns and some cluster will look deliberate. Many cancer-cluster scares and hot-streak stock pickers are paint, applied after the shooting.",
            "art": "target"
          },
          {
            "type": "reveal",
            "prompt": "A stock-tips newsletter has called the market right six months straight. Before subscribing, what are you not seeing?",
            "answer": "The other newsletters. Mail 64 people every combination of up/down predictions and one recipient sees six perfect calls. Survivorship bias plus the sharpshooter: you see the bullseye, never the sprayed barn."
          },
          {
            "type": "concept",
            "title": "The Motte and the Bailey",
            "body": "Philosopher Nicholas Shackel named this one in 2005, after medieval castles: advance a bold claim (the fertile bailey), and when attacked, retreat to a modest one (the fortified motte) — 'all I'm saying is...' — then creep back out once pressure fades. The tell: the claim defended is not the claim advanced.",
            "art": "shield"
          },
          {
            "type": "example",
            "title": "All I'm Saying Is...",
            "body": "In the wild: 'This cleanse detoxifies your body' shrinks, under questioning, to 'I just mean vegetables are healthy' — then the product page resumes selling detox. Counter it by naming both claims: 'The modest version is true but trivial. The bold version is the one that needs defending. Which are you making?'",
            "art": "layers"
          },
          {
            "type": "concept",
            "title": "Who Has to Prove What",
            "body": "The burden of proof rests on whoever asserts — and grows with the assertion's surprise. Bertrand Russell's 1952 teapot: nobody can disprove a tiny teapot orbiting the sun, yet that's no reason to believe in one. 'Prove me wrong' quietly swaps the rules; unfalsifiable is not the same as true.",
            "art": "balance"
          },
          {
            "type": "quote",
            "text": "What can be asserted without evidence can also be dismissed without evidence.",
            "by": "Christopher Hitchens"
          },
          {
            "type": "mcq",
            "prompt": "'You can't prove ghosts don't exist, so believing in them is reasonable.' What's the flaw?",
            "choices": [
              "It shifts the burden of proof onto the doubter",
              "It's an ad hominem attack",
              "It's a post hoc fallacy",
              "None — absence of disproof is support"
            ],
            "answer": 0,
            "explain": "The asserter owes the evidence, and 'undisprovable' isn't 'supported.' By Hitchens's razor, what's asserted without evidence can be dismissed without it."
          },
          {
            "type": "recap",
            "title": "Demand the Mechanism",
            "points": [
              "Post hoc: 'after' isn't 'because' — everything has something before it.",
              "Every correlation has four suspects: A causes B, B causes A, a hidden C, or chance.",
              "Sharpshooter: patterns found after the fact need fresh data to count.",
              "Motte-and-bailey: make sure the claim defended is the claim advanced.",
              "The burden of proof rides with the asserter; unfalsifiable isn't true."
            ]
          }
        ],
        "review": [
          {
            "front": "What is post hoc ergo propter hoc?",
            "back": "Assuming that because B followed A, A caused B. Sequence is a clue, not proof — the rooster doesn't raise the sun."
          },
          {
            "front": "Name the four explanations for any correlation between A and B.",
            "back": "A causes B, B causes A, a third factor drives both, or chance."
          },
          {
            "front": "What is the motte-and-bailey tactic?",
            "back": "Advancing a bold claim, retreating to a modest defensible one when challenged, then creeping back to the bold one."
          },
          {
            "front": "What is Hitchens's razor?",
            "back": "What can be asserted without evidence can be dismissed without evidence — the burden of proof sits with the asserter."
          }
        ]
      }
    ]
  }
];
