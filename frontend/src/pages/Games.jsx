import { useState } from "react";

const API_URL =
  "https://opentdb.com/api.php?amount=10&type=multiple&encode=url3986";

const GAME_MODES = [
  {
    id: "food",
    title: "Food Trivia",
    description: "Test your knowledge about food, restaurants, drinks, and cooking.",
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    type: "trivia",
  },
  {
    id: "quick",
    title: "Quick Trivia",
    description: "Answer random trivia questions and see how high you can score.",
    image:
      "https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=900&q=80",
    type: "trivia",
  },
  {
    id: "pokemon",
    title: "Pokémon Guess",
    description: "Can you identify the Pokémon from its picture?",
    image:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
    type: "pokemon",
  },
  {
    id: "memory",
    title: "Memory Match",
    description: "Find all matching pairs before you run out of moves.",
    image:
      "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=900&q=80",
    type: "memory",
  },
  {
    id: "rps",
    title: "Rock Paper Scissors",
    description: "Challenge the computer and see who wins.",
    image:
      "https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=900&q=80",
    type: "rps",
  },
  {
    id: "number",
    title: "Number Challenge",
    description: "Guess the secret number and beat the challenge.",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    type: "number",
  },
];

function decodeText(text) {
  return decodeURIComponent(text);
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function Games() {
  const [selectedGame, setSelectedGame] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");

  const [pokemon, setPokemon] = useState(null);
  const [pokemonOptions, setPokemonOptions] = useState([]);
  const [pokemonScore, setPokemonScore] = useState(0);

  const [number, setNumber] = useState(null);
  const [guess, setGuess] = useState("");
  const [numberMessage, setNumberMessage] = useState("");
  const [numberAttempts, setNumberAttempts] = useState(0);

  const [rpsChoice, setRpsChoice] = useState("");
  const [rpsResult, setRpsResult] = useState("");

  const startGame = async (game) => {
    setSelectedGame(game);
    setFinished(false);
    setError("");
    setScore(0);
    setCurrentQuestion(0);
    setSelectedAnswer(null);

    if (game.type === "trivia") {
      setLoading(true);

      try {
        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error("Failed to fetch questions.");
        }

        const data = await response.json();

        if (data.response_code !== 0 || !data.results.length) {
          throw new Error("No questions available.");
        }

        const formattedQuestions = data.results.map((question) => ({
          question: decodeText(question.question),
          correctAnswer: decodeText(question.correct_answer),
          answers: shuffle([
            decodeText(question.correct_answer),
            ...question.incorrect_answers.map(decodeText),
          ]),
        }));

        setQuestions(formattedQuestions);
      } catch {
        setError("Unable to load the game. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    if (game.type === "pokemon") {
      startPokemonGame();
    }

    if (game.type === "number") {
      setNumber(Math.floor(Math.random() * 100) + 1);
      setGuess("");
      setNumberMessage("");
      setNumberAttempts(0);
    }

    if (game.type === "rps") {
      setRpsChoice("");
      setRpsResult("");
    }
  };

  const startPokemonGame = async () => {
    setLoading(true);
    setPokemonScore(0);

    try {
      const randomId = Math.floor(Math.random() * 151) + 1;

      const pokemonResponse = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${randomId}`
      );

      const pokemonData = await pokemonResponse.json();

      const optionIds = new Set([randomId]);

      while (optionIds.size < 4) {
        optionIds.add(Math.floor(Math.random() * 151) + 1);
      }

      const options = await Promise.all(
        [...optionIds].map(async (id) => {
          const response = await fetch(
            `https://pokeapi.co/api/v2/pokemon/${id}`
          );

          return response.json();
        })
      );

      setPokemon(pokemonData);
      setPokemonOptions(shuffle(options));
    } catch {
      setError("Unable to load Pokémon. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTriviaAnswer = (answer) => {
    if (selectedAnswer) return;

    setSelectedAnswer(answer);

    if (answer === questions[currentQuestion].correctAnswer) {
      setScore((previous) => previous + 1);
    }
  };

  const nextQuestion = () => {
    if (currentQuestion === questions.length - 1) {
      setFinished(true);
      return;
    }

    setCurrentQuestion((previous) => previous + 1);
    setSelectedAnswer(null);
  };

  const handlePokemonAnswer = (answer) => {
    if (answer === pokemon.name) {
      setPokemonScore((previous) => previous + 1);
      alert("Correct!");
    } else {
      alert(`Wrong! It was ${pokemon.name}.`);
    }

    startPokemonGame();
  };

  const handleNumberGuess = (event) => {
    event.preventDefault();

    const userGuess = Number(guess);

    if (!userGuess) return;

    setNumberAttempts((previous) => previous + 1);

    if (userGuess === number) {
      setNumberMessage(
        `Correct! You guessed it in ${numberAttempts + 1} attempts.`
      );
      return;
    }

    if (userGuess < number) {
      setNumberMessage("Too low. Try again.");
    } else {
      setNumberMessage("Too high. Try again.");
    }
  };

  const playRPS = (choice) => {
    const choices = ["Rock", "Paper", "Scissors"];
    const computer = choices[Math.floor(Math.random() * choices.length)];

    setRpsChoice(choice);

    if (choice === computer) {
      setRpsResult(`You chose ${choice}. Computer chose ${computer}. Draw!`);
      return;
    }

    const won =
      (choice === "Rock" && computer === "Scissors") ||
      (choice === "Paper" && computer === "Rock") ||
      (choice === "Scissors" && computer === "Paper");

    setRpsResult(
      won
        ? `You chose ${choice}. Computer chose ${computer}. You win!`
        : `You chose ${choice}. Computer chose ${computer}. You lose!`
    );
  };

  const backToGames = () => {
    setSelectedGame(null);
    setQuestions([]);
    setPokemon(null);
    setPokemonOptions([]);
    setFinished(false);
    setError("");
  };

  // -------------------------
  // GAME GRID
  // -------------------------

  if (!selectedGame) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-10">
        <div className="mb-10">
          <h1 className="mb-3 text-3xl font-bold text-gray-800">
            QuickBite <span className="text-red-500">Games</span>
          </h1>

          <p className="text-gray-600">
            Have some fun while you wait for your order.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_MODES.map((game) => (
            <div
              key={game.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <img
                src={game.image}
                alt={game.title}
                className="h-48 w-full object-cover"
              />

              <div className="p-6">
                <h2 className="mb-3 text-xl font-bold text-gray-800">
                  {game.title}
                </h2>

                <p className="mb-6 min-h-[48px] text-gray-600">
                  {game.description}
                </p>

                <button
                  onClick={() => startGame(game)}
                  className="w-full rounded-lg bg-red-500 px-5 py-3 font-bold text-white transition hover:bg-red-600"
                >
                  Play Game
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  // -------------------------
  // LOADING
  // -------------------------

  if (loading) {
    return (
      <main className="mx-auto max-w-[900px] px-5 py-10">
        <div className="rounded-xl bg-white p-12 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800">
            Loading {selectedGame.title}...
          </h1>
        </div>
      </main>
    );
  }

  // -------------------------
  // ERROR
  // -------------------------

  if (error) {
    return (
      <main className="mx-auto max-w-[700px] px-5 py-10">
        <div className="rounded-xl bg-white p-10 text-center shadow-sm">
          <h1 className="mb-4 text-2xl font-bold text-gray-800">
            Something went wrong
          </h1>

          <p className="mb-6 text-red-500">{error}</p>

          <button
            onClick={() => startGame(selectedGame)}
            className="mr-3 rounded-lg bg-red-500 px-6 py-3 font-bold text-white"
          >
            Try Again
          </button>

          <button
            onClick={backToGames}
            className="rounded-lg border-2 border-red-500 px-6 py-3 font-bold text-red-500"
          >
            Back to Games
          </button>
        </div>
      </main>
    );
  }

  // -------------------------
  // TRIVIA GAME
  // -------------------------

  if (selectedGame.type === "trivia") {
    if (finished) {
      return (
        <main className="mx-auto max-w-[700px] px-5 py-10">
          <div className="rounded-xl bg-white p-10 text-center shadow-sm">
            <h1 className="mb-4 text-3xl font-bold text-gray-800">
              Game Complete
            </h1>

            <p className="mb-2 text-lg text-gray-600">
              Your score
            </p>

            <p className="mb-8 text-5xl font-bold text-red-500">
              {score} / {questions.length}
            </p>

            <button
              onClick={() => startGame(selectedGame)}
              className="mr-3 rounded-lg bg-red-500 px-6 py-3 font-bold text-white"
            >
              Play Again
            </button>

            <button
              onClick={backToGames}
              className="rounded-lg border-2 border-red-500 px-6 py-3 font-bold text-red-500"
            >
              Other Games
            </button>
          </div>
        </main>
      );
    }

    const question = questions[currentQuestion];

    return (
      <main className="mx-auto max-w-[900px] px-5 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {selectedGame.title}
            </h1>

            <p className="text-gray-500">
              Question {currentQuestion + 1} of {questions.length}
            </p>
          </div>

          <div className="rounded-lg bg-red-50 px-5 py-3 font-bold text-red-500">
            Score: {score}
          </div>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-8 text-xl font-bold text-gray-800">
            {question.question}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {question.answers.map((answer) => {
              const correct = answer === question.correctAnswer;
              const selected = answer === selectedAnswer;

              let classes =
                "border-gray-200 hover:border-red-500 hover:bg-red-50";

              if (selectedAnswer) {
                if (correct) {
                  classes = "border-green-500 bg-green-50 text-green-700";
                } else if (selected) {
                  classes = "border-red-500 bg-red-50 text-red-700";
                } else {
                  classes = "border-gray-200 bg-gray-50 text-gray-400";
                }
              }

              return (
                <button
                  key={answer}
                  onClick={() => handleTriviaAnswer(answer)}
                  className={`rounded-lg border-2 p-4 text-left font-semibold ${classes}`}
                >
                  {answer}
                </button>
              );
            })}
          </div>

          {selectedAnswer && (
            <button
              onClick={nextQuestion}
              className="mt-8 w-full rounded-lg bg-red-500 px-6 py-3 font-bold text-white hover:bg-red-600"
            >
              {currentQuestion === questions.length - 1
                ? "Finish Game"
                : "Next Question"}
            </button>
          )}
        </div>

        <button
          onClick={backToGames}
          className="mt-6 rounded-lg border-2 border-red-500 px-5 py-3 font-semibold text-red-500"
        >
          Back to Games
        </button>
      </main>
    );
  }

  // -------------------------
  // POKEMON GAME
  // -------------------------

  if (selectedGame.type === "pokemon") {
    return (
      <main className="mx-auto max-w-[800px] px-5 py-10">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-bold text-gray-800">
            Pokémon Guess
          </h1>

          <p className="mb-6 text-gray-500">
            Score: {pokemonScore}
          </p>

          {pokemon && (
            <>
              <img
                src={pokemon.sprites.other["official-artwork"].front_default}
                alt="Mystery Pokémon"
                className="mx-auto mb-8 h-64 w-64 object-contain"
              />

              <h2 className="mb-6 text-xl font-bold text-gray-800">
                Who is this Pokémon?
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {pokemonOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handlePokemonAnswer(option.name)}
                    className="rounded-lg border-2 border-gray-200 p-4 font-bold capitalize text-gray-700 hover:border-red-500 hover:bg-red-50"
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={backToGames}
          className="mt-6 rounded-lg border-2 border-red-500 px-5 py-3 font-semibold text-red-500"
        >
          Back to Games
        </button>
      </main>
    );
  }

  // -------------------------
  // NUMBER GAME
  // -------------------------

  if (selectedGame.type === "number") {
    return (
      <main className="mx-auto max-w-[600px] px-5 py-10">
        <div className="rounded-xl bg-white p-10 text-center shadow-sm">
          <h1 className="mb-3 text-3xl font-bold text-gray-800">
            Number Challenge
          </h1>

          <p className="mb-8 text-gray-600">
            Guess a number between 1 and 100.
          </p>

          <form onSubmit={handleNumberGuess}>
            <input
              type="number"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              className="mb-4 w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-center text-xl outline-none focus:border-red-500"
              placeholder="Enter your guess"
              min="1"
              max="100"
            />

            <button
              type="submit"
              className="w-full rounded-lg bg-red-500 px-6 py-3 font-bold text-white hover:bg-red-600"
            >
              Guess
            </button>
          </form>

          {numberMessage && (
            <p className="mt-6 font-bold text-red-500">
              {numberMessage}
            </p>
          )}

          {numberMessage.startsWith("Correct") && (
            <button
              onClick={() => startGame(selectedGame)}
              className="mt-6 rounded-lg border-2 border-red-500 px-6 py-3 font-bold text-red-500"
            >
              Play Again
            </button>
          )}
        </div>

        <button
          onClick={backToGames}
          className="mt-6 rounded-lg border-2 border-red-500 px-5 py-3 font-semibold text-red-500"
        >
          Back to Games
        </button>
      </main>
    );
  }

  // -------------------------
  // ROCK PAPER SCISSORS
  // -------------------------

  if (selectedGame.type === "rps") {
    return (
      <main className="mx-auto max-w-[700px] px-5 py-10">
        <div className="rounded-xl bg-white p-10 text-center shadow-sm">
          <h1 className="mb-3 text-3xl font-bold text-gray-800">
            Rock Paper Scissors
          </h1>

          <p className="mb-8 text-gray-600">
            Choose your move.
          </p>

          <div className="grid grid-cols-3 gap-4">
            {["Rock", "Paper", "Scissors"].map((choice) => (
              <button
                key={choice}
                onClick={() => playRPS(choice)}
                className="rounded-lg bg-red-500 px-4 py-5 font-bold text-white hover:bg-red-600"
              >
                {choice}
              </button>
            ))}
          </div>

          {rpsResult && (
            <p className="mt-8 text-lg font-bold text-gray-800">
              {rpsResult}
            </p>
          )}
        </div>

        <button
          onClick={backToGames}
          className="mt-6 rounded-lg border-2 border-red-500 px-5 py-3 font-semibold text-red-500"
        >
          Back to Games
        </button>
      </main>
    );
  }

  return null;
}

export default Games;