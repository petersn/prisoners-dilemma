import React from 'react';
import { Controlled as ControlledCodeMirror } from 'react-codemirror2';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/python/python';
import RawCodeMirror from 'codemirror';
import SplitPane from 'react-split-pane';
import './App.css';

function builtinRead(x: string) {
  const Sk = (window as any).Sk;
  if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
    throw "File not found: '" + x + "'";
  return Sk.builtinFiles["files"][x];
}

function numberWithSign(x: number, prec: number): string {
  return x > 0 ? '+' + x.toFixed(prec) : x.toFixed(prec);
}

function mean(l: number[]): number {
  let sum = 0;
  for (const value of l)
    sum += value;
  return sum / l.length;
}

function colorAmount(x: number, iters: number): string {
  const val = x / (3 * iters) + 1 / 3;
  const r = 255 - 255 * val;
  const g = 255 * val;
  const b = 64;
  return `rgba(${r}, ${g}, ${b}, 1)`;
}

// XXX: FIXME: Change this!
const WS_HOST = '10.42.0.1';

const DEFAULT_STARTING_CODE = `import random
import itertools

class CooperateBot:
    def play(self, our_moves, their_moves):
        return Cooperate

class RandomBot:
    def play(self, our_moves, their_moves):
        # Defect one third of the time randomly.
        return random.choice([Cooperate, Cooperate, Defect])

class RetaliateBot:
    def play(self, our_moves, their_moves):
        # If they have defected in the last three moves, then defect.
        if Defect in their_moves[-3:]:
            return Defect
        # Otherwise, we cooperate.
        return Cooperate

class TitForTatBot:
    def play(self, our_moves, their_moves):
        # Repeat their last move back at them.
        if their_moves:
            return their_moves[-1]
           # Cooperate on the first move of the game.
        return Cooperate

class YourFirstBot:
    def __init__(self):
        # You can setup any state you want here.
        pass

    def play(self, our_moves, their_moves):
        ...
        return Cooperate


# ===== Run a tournament between these bots =====    

ITERATIONS = 20

def play_game(a_class, b_class):
    a_bot, b_bot = a_class(), b_class()
    a_moves, b_moves = [], []
    builtin_start_game(a_class.__name__, b_class.__name__)
    for _ in range(ITERATIONS):
        a_move = a_bot.play(a_moves, b_moves)
        b_move = b_bot.play(b_moves, a_moves)
        builtin_report_move(a_move, b_move)
        a_moves.append(a_move)
        b_moves.append(b_move)
    builtin_end_game()

def run_tournament(bots, rounds=1):
    for a_class, b_class in itertools.product(bots, repeat=2):
        for _ in range(rounds):
            play_game(a_class, b_class)

run_tournament([
    # Add as many bots as you'd like here!
    YourFirstBot,

    # Test bots to play against.
    CooperateBot,
    RandomBot,
    RetaliateBot,
    TitForTatBot,
])
`;

function makeCode(base: string, botNames: string) {
  return `import random
import itertools

${base.replaceAll('\t', '    ')}

# ===== Run a tournament between these bots =====

ITERATIONS = 30

def play_game(a_class, b_class):
    a_bot, b_bot = a_class(), b_class()
    a_moves, b_moves = [], []
    builtin_start_game(a_class.__name__, b_class.__name__)
    for _ in range(ITERATIONS):
        a_move = a_bot.play(a_moves, b_moves)
        b_move = b_bot.play(b_moves, a_moves)
        builtin_report_move(a_move, b_move)
        a_moves.append(a_move)
        b_moves.append(b_move)
    builtin_end_game()

def run_tournament(bots, rounds=5):
    for a_class, b_class in itertools.product(bots, repeat=2):
        for _ in range(rounds):
            play_game(a_class, b_class)

run_tournament([
    ${botNames}
])
`;
}

const SLOT1_DEFAULT_CODE = `# Put your first bot here!

class YourFirstBot:
    def __init__(self):
        # You can setup any state you want here.
        pass

    def play(self, our_moves, their_moves):
        ...
        return Cooperate
`;

const SLOT2_DEFAULT_CODE = `# Put your second bot here!

class YourSecondBot:
    def __init__(self):
        # You can setup any state you want here.
        pass

    def play(self, our_moves, their_moves):
        ...
        return Cooperate
`;

interface ITextEditorProps {
  lsKey: string;
  startingCode: string;
  extraKeysMaker: (textEditorComponent: TextEditor) => any;
}

interface ITextEditorState {
  code: string;
}

class TextEditor extends React.PureComponent<ITextEditorProps, ITextEditorState> {
  constructor(props: ITextEditorProps) {
    super(props);
    //this.state = { code:  };
    if (localStorage.getItem(this.props.lsKey) === null)
      localStorage.setItem(this.props.lsKey, this.props.startingCode);
  }

  render() {
    return <div>
      <ControlledCodeMirror
        value={localStorage.getItem(this.props.lsKey)!}
        options={{
          mode: 'python',
          theme: 'material',
          lineNumbers: true,
          indentUnit: 4,
          lineWrapping: true,
          extraKeys: this.props.extraKeysMaker(this),
        }}
        onBeforeChange={(editor, data, code) => {
          localStorage.setItem(this.props.lsKey, code);
          this.forceUpdate();
          //this.setState({ code });
        }}
      />
    </div>;
  }
}

interface IGame {
  gameName: string;
  nameA: string;
  nameB: string;
  movesA: boolean[];
  movesB: boolean[];
  scoreA: number;
  scoreB: number;
}

class App extends React.PureComponent<{}, {
  websocketState: string;
  terminalOutput: string;
  paneColor: string;
  allGames: IGame[];
  competeOpen: boolean;
  saved: [boolean, boolean];
  streamUpdates: boolean;
}> {
  textEditorRef = React.createRef<TextEditor>();
  socket: WebSocket | null;
  connectionAttempt = 0;
  lastCompiled: any = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      websocketState: 'Not yet connected to server',
      terminalOutput: '...',
      paneColor: '#222',
      allGames: [],
      competeOpen: false,
      saved: [false, false],
      streamUpdates: false,
    };
    this.socket = null;

    if (localStorage.getItem('my-name') === null)
      localStorage.setItem('my-name', '???');

    setTimeout(this.reconnect, 200);
    setInterval(this.streamTick, 2000);
  }

  reconnect = () => {
    this.connectionAttempt++;
    this.setState({
      websocketState: `Connecting to server (try ${this.connectionAttempt})...`,
    });
    this.socket = new WebSocket(`ws://${WS_HOST}:10100/`);
    this.socket.addEventListener('open', (event) => {
      this.setState({ websocketState: 'Connected' });
      this.connectionAttempt = 0;
    });
    this.socket.addEventListener('error', (event) => {
      this.setState({ websocketState: 'Web socket error!' });
    });
    this.socket.addEventListener('close', (event) => {
      this.setState({ websocketState: 'Not connected' });
    });
    // Listen for messages
    this.socket.addEventListener('message', (event) => {
      //this.setState({ message: event.data.toString() });
      const result = JSON.parse(event.data);
      if (result.kind === 'submitted') {
        const saved = [...this.state.saved] as [boolean, boolean];
        saved[result.position - 1] = true;
        this.setState({ saved });
      }
      if (result.kind === 'get') {
        const compiled = makeCode(result.base, result.botNames);
        localStorage.setItem('code', compiled);
        console.log('Fetched code:', compiled);
        this.forceUpdate();
        if (this.state.streamUpdates && compiled !== this.lastCompiled) {
          this.rerunCode();
        }
        this.lastCompiled = compiled;
      }
    });
  }

  getCode = () => {
    const code = localStorage.getItem('code');
    if (code === null)
      return 'raise Exception("Internal bug: localStorage.code is null")';
    return code.replaceAll('\t', '    ');
    //if (this.textEditorRef.current !== null)
    //  return this.textEditorRef.current.state.code.replace('\t', '    ');
    //return 'raise Exception("Internal bug: textEditorRef is null")';
  }

  rerunCode = () => {
    this.setState({
        terminalOutput: 'Running...',
        paneColor: '#334',
    });
    //setTimeout(() => {
      const Sk = (window as any).Sk;
      Sk.pre = 'output';
      const code = 'print("Test skulpt message")\n';
      const results: string[] = [];

      //Sk.builtins.actions = Sk.ffi.remapToPy({
      //  'Cooperate': 'Cooperate',
      //  'Defect': 'Defect',
      //});
      //console.log('Result:', Sk.builtins.actions);
      Sk.builtins.Cooperate = Sk.ffi.remapToPy('Cooperate');
      Sk.builtins.Defect = Sk.ffi.remapToPy('Defect');

      var allGames: IGame[] = [];
      var currentGame: any = null;

      Sk.builtins.builtin_start_game = (a_name_: any, b_name_: any) => {
        const a_name = Sk.ffi.remapToJs(a_name_);
        const b_name = Sk.ffi.remapToJs(b_name_);
        const gameName = a_name + ' vs ' + b_name;
        currentGame = {
          gameName,
          nameA: a_name,
          nameB: b_name,
          movesA: [],
          movesB: [],
          scoreA: 0,
          scoreB: 0,
        };
        allGames.push(currentGame);
      };
      Sk.builtins.builtin_start_game.co_varnames = ['a_bot_name', 'b_bot_name'];
      Sk.builtins.builtin_start_game.co_numargs = 2;

      Sk.builtins.builtin_report_move = (a_move_: any, b_move_: any) => {
        const a_move = Sk.ffi.remapToJs(a_move_);
        const b_move = Sk.ffi.remapToJs(b_move_);
        if (a_move !== 'Cooperate' && a_move !== 'Defect')
          throw `All moves must be either "Cooperate" or "Defect". Got invalid move: ${a_move.toString()}`;
        if (b_move !== 'Cooperate' && b_move !== 'Defect')
          throw `All moves must be either "Cooperate" or "Defect". Got invalid move: ${b_move.toString()}`;
        if (currentGame === null)
          throw 'No current game!';
        currentGame.movesA.push(a_move === 'Defect');
        currentGame.movesB.push(b_move === 'Defect');
        currentGame.scoreA += 1;
        currentGame.scoreB += 1;
        if (a_move === 'Defect') {
          currentGame.scoreA += 1;
          currentGame.scoreB -= 2;
        }
        if (b_move === 'Defect') {
          currentGame.scoreA -= 2;
          currentGame.scoreB += 1;
        }
      };
      Sk.builtins.builtin_report_move.co_varnames = ['a_move', 'b_move'];
      Sk.builtins.builtin_report_move.co_numargs = 2;

      Sk.builtins.builtin_end_game = () => {
        currentGame = null;
      };
      Sk.builtins.builtin_end_game.co_varnames = [];
      Sk.builtins.builtin_end_game.co_numargs = 0;

      Sk.configure({
        output: (obj: any) => {
          results.push(obj.toString());
        },
        read: builtinRead,
        execLimit: 5000,
      });
      var myPromise = Sk.misceval.asyncToPromise(() => {
        return Sk.importMainWithBody("<stdin>", false, this.getCode(), true);
      });
      myPromise.then(
        (mod: any) => {
          let terminalOutput = results.join('');
          if (terminalOutput && !terminalOutput.endsWith('\n'))
            terminalOutput += '\n';
          console.log('Got games:', allGames);
          this.setState({ terminalOutput, paneColor: '#222', allGames });
        },
        (err: any) => {
          this.setState({
            terminalOutput: results.join('') + '\n' + err.toString(),
            paneColor: '#433',
          });
        },
      );
    //}, 1);
  }

  streamTick = () => {
    if (this.state.streamUpdates)
      this.fetchCode();
  }

  fetchCode = () => {
    if (this.socket === null) {
      alert('Not connected! Try refreshing the page?');
      return;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      alert('Socket not connected! Try refreshing the page?');
      return;
    }
    this.socket.send(JSON.stringify({
      kind: 'get',
    }));
  }

  submitBot(position: number, code: string) {
    if (this.socket === null) {
      alert('Not connected! Try refreshing the page?');
      return;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      alert('Socket not connected! Try refreshing the page?');
      return;
    }
    this.socket.send(JSON.stringify({
      kind: 'submit',
      myName: localStorage.getItem('my-name')!,
      position,
      code,
    }));
  }

  render() {
    function buildRow(name: string, moves: boolean[], finalScore: number) {
      return (
        <tr>
          <td style={{ width: 150, fontFamily: 'monospace', fontSize: '120%', fontWeight: 'bold' }}>{name}</td>
          <td style={{ border: '1px solid black', width: 70 }}>Score: {numberWithSign(finalScore, 0)}</td>
          {moves.map((move, i) =>
            <td key={i} style={{
              width: 20,
              height: 20,
              backgroundColor: move ? '#833' : '#363',
              color: move ? 'red' : 'black',
              textAlign: 'center',
            }}>
              {move ? 'D' : 'C'}
            </td>
          )}
        </tr>
      );
    }

    const scoreboard = new Map<string, number>();
    const gamesPlayed = new Map<string, number>();
    const crossTable = new Map<string, number[]>();
    const allPlayers: string[] = [];
    let iters = 0;

    for (const game of this.state.allGames) {
      if (!scoreboard.has(game.nameA)) {
        scoreboard.set(game.nameA, 0);
        allPlayers.push(game.nameA);
      }
      if (!scoreboard.has(game.nameB)) {
        scoreboard.set(game.nameB, 0);
        allPlayers.push(game.nameB);
      }
      scoreboard.set(game.nameA, scoreboard.get(game.nameA)! + game.scoreA);
      scoreboard.set(game.nameB, scoreboard.get(game.nameB)! + game.scoreB);

      if (!gamesPlayed.has(game.nameA))
        gamesPlayed.set(game.nameA, 0);
      if (!gamesPlayed.has(game.nameB))
        gamesPlayed.set(game.nameB, 0);
      gamesPlayed.set(game.nameA, gamesPlayed.get(game.nameA)! + 1);
      gamesPlayed.set(game.nameB, gamesPlayed.get(game.nameB)! + 1);

      for (const [score, namePair] of [
        [game.scoreA, game.nameA + ' |vs| ' + game.nameB],
        [game.scoreB, game.nameB + ' |vs| ' + game.nameA],
      ] as [number, string][]) {
        if (!crossTable.has(namePair))
          crossTable.set(namePair, []);
        crossTable.set(namePair, [...crossTable.get(namePair)!, score]);
      }

      iters = game.movesA.length;
    }

    allPlayers.sort((a, b) => {
      const rateA = scoreboard.get(a)! / gamesPlayed.get(a)!;
      const rateB = scoreboard.get(b)! / gamesPlayed.get(b)!;
      return rateB - rateA;
    })

    return <div>

      <SplitPane
        split="vertical"
        minSize={300}
        defaultSize={parseInt(localStorage.getItem('split1') || '500')}
        onChange={(size) => localStorage.setItem('split1', size.toString())}
        resizerStyle={{
          background: 'black',
          width: '3px',
          minWidth: '3px',
          cursor: 'col-resize',
          height: '100%',
          zIndex: 20,
        }}
      >
        <div className='mainPane'>

          {/* Top left bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: '#444',
            borderBottom: '2px solid #222',
            height: 60,
            color: 'white',
            whiteSpace: 'nowrap',
          }}>
            <div
              style={{
                bottom: 10,
                right: 10,
              }}
              className='mainButton'
              onClick={() => {
                if (window.confirm('Throw away your code and reset to the starting code?')) {
                  localStorage.setItem('code', DEFAULT_STARTING_CODE);
                  if (this.textEditorRef.current !== null)
                    this.textEditorRef.current.forceUpdate();
                }
              }}
            >
              Reset code
            </div>

            <div
              style={{
                bottom: 10,
                right: 10,
              }}
              className='mainButton'
              onClick={() => this.setState({ competeOpen: !this.state.competeOpen })}
            >
              Compete
            </div>

            {/*
            <div
              style={{
                bottom: 10,
                right: 10,
              }}
              className='mainButton'
              onClick={this.reconnect}
            >
              Reconnect
            </div>
            */}

            <div style={{ fontSize: '130%', marginLeft: 10 }}>
              {this.state.streamUpdates && '* '}
              State: {this.state.websocketState}
            </div>
          </div>

          <TextEditor
            lsKey='code'
            startingCode={DEFAULT_STARTING_CODE}
            ref={this.textEditorRef}
            extraKeysMaker={(textEditorComponent) => ({
              'Ctrl-Enter': (cm: any) => {
                this.rerunCode();
              },
              'Ctrl-S': (cm: any) => {},
              'Ctrl-E': (cm: any) => {
                if (localStorage.getItem('my-name') !== 'dev')
                  return;
                this.setState({ streamUpdates: !this.state.streamUpdates });
                //this.fetchCode();
              },
              //'Tab': (cm: any) => {
              //  cm.replaceSelection('    ', 'end');
              //},
            })}
          />
        </div>

        <div style={{ padding: 10, backgroundColor: '#888', height: '100%', overflowY: 'scroll' }}>
          <div style={{
            margin: 10,
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            backgroundColor: this.state.paneColor,
            color: 'white',
            overflow: 'scroll',
            padding: 10,
          }}>
            Python output:<br/>
            <span style={{color: 'lightblue'}}>{this.state.terminalOutput}</span>
          </div>

          <div style={{
            border: '1px solid black',
            borderRadius: 10,
            padding: 10,
            margin: 10,
            backgroundColor: '#777',
          }}>
            Scoreboard:
            <table style={{
            }}>
              {allPlayers.map((playerName, i) =>
                <tr>
                  <td>#{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 'bold', paddingRight: '20px' }}>{playerName}</td>
                  <td>Average score: {numberWithSign(scoreboard.get(playerName)! / gamesPlayed.get(playerName)!, 2)}</td>
                </tr>
              )}
            </table>
          </div>

          <div style={{
            border: '1px solid black',
            borderRadius: 10,
            padding: 10,
            margin: 10,
            backgroundColor: '#777',
          }}>
            Cross table:
            <table style={{
              marginTop: 40,
            }}>
              <tr>
                <td></td>
                {allPlayers.map((otherPlayerName, i) =>
                  <td key={i} style={{
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    position: 'relative',
                    width: 50,
                    height: 30,
                  }}>
                    <div style={{
                      position: 'absolute',
                      transform: 'rotate(-45deg) translate(5px, -50%) translate(0px, -5px)',
                      width: '100%',
                      whiteSpace: 'nowrap',
                    }}>
                      {otherPlayerName}
                    </div>
                  </td>
                )}
              </tr>
              {allPlayers.map((playerName, i) =>
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 'bold', paddingRight: '5px' }}>{playerName}</td>

                  {allPlayers.map((otherPlayerName, j) =>
                    <td style={{
                      border: '1px solid black',
                      textAlign: 'center',
                      backgroundColor: colorAmount(
                        mean(crossTable.get(playerName + ' |vs| ' + otherPlayerName)!), iters),
                    }}>{mean(crossTable.get(playerName + ' |vs| ' + otherPlayerName)!)}</td>
                  )}
                </tr>
              )}
            </table>
          </div>

          All games:
          <div style={{
            whiteSpace: 'nowrap',
            fontSize: '80%',
          }}>
            {this.state.allGames.map((game, i) =>
              <div
                key={i}
                style={{
                  margin: 5,
                  padding: 5,
                  backgroundColor: '#aaa',
                  border: '1px solid black',
                }}
              >
                <table>
                  {buildRow(game.nameA, game.movesA, game.scoreA)}
                  {buildRow(game.nameB, game.movesB, game.scoreB)}
                </table>
              </div>
            )}
          </div>
          <br/>
        </div>
      </SplitPane>

      <div style={{
        position: 'absolute',
        width: 800,
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: '0px 0px 10px black',
        right: this.state.competeOpen ? 810 : 0,
        zIndex: 100,
        backgroundColor: '#aaa',
        transition: '0.2s right',
        padding: 10,
        transform: 'translate(810px, 0px)',
        overflowY: 'scroll',
      }}>
        <div style={{ position: 'sticky', top: 0 }}>
          <div
            style={{ position: 'absolute', top: 5, right: 5, fontSize: '120%', padding: 4 }}
            className='hoverButton'
            onClick={() => this.setState({ competeOpen: false })}
          >
            ✕
          </div>
        </div>

        <b>Compete against your fellow students!</b><br/>
        <br/>
        <span style={{ fontSize: '150%' }}>
          Put your name here: <input
            value={localStorage.getItem('my-name')!}
            onChange={(evt) => {
              localStorage.setItem('my-name', evt.target.value );
              this.forceUpdate();
            }}
          />
        </span>
        <br/>
        <br/>
        Each student gets two bot slots.
        Your bots will be graded on how they do against <i>all</i> bots (including themself and your other bot).

        <br/>
        <br/>
        <b>Bot slot #1:</b>
        <TextEditor
          lsKey='slot1-code'
          startingCode={SLOT1_DEFAULT_CODE}
          extraKeysMaker={(textEditorComponent) => ({
            'Ctrl-S': (cm: any) => {},
          })}
        />
        <div
          style={{
            bottom: 10,
            right: 10,
            display: 'inline-block',
            opacity: localStorage.getItem('my-name') === '???' ? 0.5 : 1,
          }}
          className='mainButton'
          onClick={() => {
            this.submitBot(1, localStorage.getItem('slot1-code')!);
          }}
        >
          Submit Bot #1
        </div>
        {this.state.saved[0] && 'Submitted successfully!'}
        <br/>

        <br/>
        <b>Bot slot #2:</b>
        <TextEditor
          lsKey='slot2-code'
          startingCode={SLOT2_DEFAULT_CODE}
          extraKeysMaker={(textEditorComponent) => ({
            'Ctrl-S': (cm: any) => {},
          })}
        />
        <div
          style={{
            bottom: 10,
            right: 10,
            display: 'inline-block',
            opacity: localStorage.getItem('my-name') === '???' ? 0.5 : 1,
          }}
          className='mainButton'
          onClick={() => {
            this.submitBot(2, localStorage.getItem('slot2-code')!);
          }}
        >
          Submit Bot #2
        </div>
        {this.state.saved[1] && 'Submitted successfully!'}
      </div>
    </div>;
  }
}

export default App;