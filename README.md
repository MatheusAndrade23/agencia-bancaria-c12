# Agência Bancária: escalonamento e sincronismo de threads

Simulador visual para a disciplina de Sistemas Operacionais (C12). Uma agência bancária roda inteira no navegador: cada **caixa é uma thread real** (Web Worker), os **saldos ficam em memória compartilhada** (SharedArrayBuffer) e os clientes da fila trazem operações sobre essas contas.

O objetivo é comparar, sobre a mesma fila de clientes:

1. quatro algoritmos de escalonamento da fila (FCFS, SJF, Prioridade e Prioridade com Aging);
2. quatro estratégias de sincronismo das contas (sem lock, lock global, lock por cofre ordenado e lock por cofre sem ordenação, que entra em deadlock).

Cada execução é salva no navegador e aparece na tela de comparações, com tabela, matriz, gráficos e Gantts lado a lado.

## Como rodar

Requisitos: Node.js 20 ou mais recente e um navegador atual (Chrome, Edge, Firefox ou Safari).

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (por padrão `http://localhost:5173`).

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | roda os testes unitários (Vitest) |
| `npm run build` | checa os tipos e gera a versão de produção em `dist/` |
| `npm run preview` | serve a versão de produção, já com os headers certos |

### Por que os headers COOP/COEP são necessários

`SharedArrayBuffer` permite que várias threads leiam e escrevam a mesma memória. Depois dos ataques Spectre, os navegadores só liberam esse recurso em páginas **cross-origin isolated**, isto é, páginas que garantem não compartilhar o processo com conteúdo de outras origens. O servidor declara isso com dois headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

O `vite.config.ts` envia os dois tanto no `npm run dev` quanto no `npm run preview`. Sem eles, `crossOriginIsolated` fica `false`, o `SharedArrayBuffer` não existe e o app mostra um aviso vermelho no topo em vez de rodar. Abrir o `index.html` direto do disco ou servir `dist/` com um servidor qualquer cai nesse caso. O isolamento também exige contexto seguro: `localhost` ou HTTPS.

## Como a simulação funciona

### Threads e memória reais

- Cada caixa é um Web Worker separado (`src/workers/teller.worker.ts`).
- Saldos, locks, fila, estado de cada caixa e o registro do que aconteceu ficam em um único `Int32Array` sobre um `SharedArrayBuffer` (`src/sim/layout.ts`).
- Os workers usam `Atomics` para tudo: `compareExchange` e `wait`/`notify` nos mutexes, `store`/`load`/`add` no estado e nos contadores.
- O "sleep" do worker é um `Atomics.wait` com timeout em uma célula que ninguém notifica.
- A thread principal **não executa nenhuma operação bancária**. Ela só lê a memória a cada quadro (`requestAnimationFrame`) para desenhar, e roda o watchdog de deadlock.
- Valores em centavos e tempos em microssegundos, sempre inteiros.

### A operação bancária

Todo atendimento tem duas partes:

1. **Atendimento** (fora da seção crítica): o caixa dorme a duração estimada da operação.
2. **Seção crítica**: ler o saldo, dormir a **janela crítica** configurável, escrever o novo saldo.

A janela entre ler e escrever é o que torna a race condition visível quando não há lock.

| Operação | Contas | Duração base | Efeito |
|---|---|---|---|
| Depósito | 1 | 60 ms | soma o valor |
| Saque | 1 | 60 ms | subtrai; recusa se o saldo for insuficiente |
| Transferência | 2 | 120 ms | tira da origem e põe no destino; recusa se faltar saldo |
| Boleto | 1 | 120 ms | subtrai; recusa se o saldo for insuficiente |
| Análise de financiamento | 1 | 300 ms | só consulta o saldo |

### A invariante

Transferências não criam nem destroem dinheiro. Ao final de qualquer execução deveria valer:

```
saldoTotalFinal = saldoTotalInicial + depósitos − saques efetivados − boletos pagos
```

Cada escrita de saldo registra também o quanto a conta *deveria* ter variado. A diferença entre o saldo real e o esperado é o **dinheiro inconsistente**, calculado em toda execução e mostrado ao vivo no painel da invariante (que fica vermelho quando diverge). O app também conta quantas contas terminaram com o saldo errado, porque em cenários só de transferências o total pode fechar por coincidência com contas individuais erradas.

### Cenário reproduzível

A fila é gerada por um PRNG com semente (mulberry32, em `src/sim/rng.ts`). A mesma configuração com a mesma seed gera **exatamente a mesma fila**, e é isso que permite comparar todos os algoritmos sobre o mesmo cenário. Cada cenário tem um hash da configuração, e cada execução salva guarda esse hash.

O app tem três abas, na ordem de uso: **Cenário e fila** (configurar e ver a fila), **Simulação** (rodar) e **Comparações** (analisar os resultados).

A aba **Cenário e fila** mostra a fila gerada antes de rodar, atualizada a cada mudança na configuração: as chegadas ao longo do tempo, a composição por tipo de operação e prioridade, a matriz de transferências entre contas (com os pares cruzados que podem dar deadlock) e a lista de todos os clientes.

Presets prontos:

- **Padrão**: mistura equilibrada, 4 caixas e 5 contas.
- **Corrida**: muitas transferências sobre 3 contas, para evidenciar a race condition.
- **Deadlock**: 2 contas e 100% de transferências cruzadas (A→B e B→A).
- **Starvation**: metade dos clientes é preferencial e a fila nunca esvazia.

### Câmera lenta sem alterar o benchmark

A execução acontece em tempo real, na velocidade das threads. Os workers registram na memória compartilhada os instantes de cada evento (início e fim de atendimento, espera e posse de lock, cada escrita de saldo), e a tela é desenhada como uma função pura de (registro, instante). Por isso o controle de velocidade, a pausa e a barra de tempo só mudam o que é exibido: as métricas vêm sempre do tempo real medido pelos workers.

### Tela cheia

Na aba **Simulação**, a caixa **Tela cheia** troca os painéis por um palco: as pessoas entram pela porta, esperam na fila, andam até o caixa e saem; o dinheiro voa entre os cofres e os caixas; e linhas ligam cada caixa ao cadeado que ele tem (contínua) ou espera (tracejada). `Esc` volta à visualização normal.

Cada pessoa na fila tem uma barrinha de paciência e um rosto que piora com a espera (🙂 😐 😒 😠 🤬). A paciência vale quatro atendimentos médios do cenário. O painel **Starvation**, no topo, mostra a maior espera do momento, quantos estão irritados e a espera média de preferenciais e comuns.

## Algoritmos de escalonamento

Todos são **não-preemptivos**: quando um caixa fica livre, ele escolhe o próximo entre os clientes que já chegaram e atende até o fim. As funções ficam em `src/sim/scheduler.ts` e são puras, por isso testáveis.

A retirada da fila é protegida por um mutex próprio (o lock da fila) em todos os modos, então nenhum cliente é atendido duas vezes. Os modos de sincronismo da próxima seção dizem respeito só às contas.

- **FCFS (First Come, First Served)**: atende na ordem de chegada. É justo e simples, mas um cliente demorado segura todos os que estão atrás dele (efeito comboio).
- **SJF (Shortest Job First)**: atende primeiro quem tem a menor duração estimada. Minimiza a espera média, mas operações longas podem ser adiadas indefinidamente se continuarem chegando operações curtas.
- **Prioridade**: preferenciais primeiro, com empate por ordem de chegada. Clientes comuns podem sofrer **starvation**: enquanto houver preferencial na fila, eles não são chamados.
- **Prioridade com Aging**: a prioridade efetiva cresce com o tempo de espera.

  ```
  prioridadeEfetiva = prioridadeBase + tempoDeEspera / passoDoAging
  ```

  Um preferencial começa com 1 e um comum com 0. A cada "passo do aging" de espera o cliente ganha um nível, então um comum que já esperou bastante passa na frente de um preferencial recém-chegado. Isso mitiga a starvation sem abandonar a prioridade.

## Modos de sincronismo das contas

O mutex (`src/sim/mutex.ts`) é uma célula do `Int32Array` com três estados (livre, travado, travado com alguém esperando). Travar é um `Atomics.compareExchange`; se falhar, a thread dorme com `Atomics.wait` e é acordada por um `Atomics.notify` de quem destrava. O tempo que cada caixa passa esperando lock é registrado.

1. **Sem lock**: ninguém trava nada. Ocorre race condition de verdade.
2. **Lock global**: um único mutex para todas as contas. É correto, mas duas operações nunca ficam na seção crítica ao mesmo tempo, mesmo sobre contas diferentes. Pouco paralelismo.
3. **Lock por cofre (ordenado)**: um mutex por conta. Na transferência, trava sempre a conta de **menor id primeiro**. É correto, tem bom paralelismo e não entra em deadlock.
4. **Lock por cofre sem ordenação**: um mutex por conta, travando a origem e depois o destino. Pode entrar em deadlock.

### Por que "sem lock" gera inconsistência

Atualizar um saldo não é uma operação atômica. São três passos: **ler**, **modificar** e **escrever** (read-modify-write). Se dois caixas intercalam esses passos sobre a mesma conta, uma das atualizações se perde:

```
Conta A começa com R$ 1.000

Caixa 1 (depósito de R$ 100)        Caixa 2 (depósito de R$ 50)
lê 1.000
                                    lê 1.000
escreve 1.100
                                    escreve 1.050   <- sobrescreve o 1.100

Resultado: R$ 1.050. Deveria ser R$ 1.150. R$ 100 sumiram.
```

O caixa 2 calculou o novo saldo a partir de um valor que já estava velho. Dependendo de quem perde a atualização, dinheiro some ou aparece. A janela crítica alarga o intervalo entre ler e escrever, o que aumenta a chance de intercalação e deixa o problema fácil de ver.

### Por que "por cofre sem ordenação" gera deadlock

Considere duas transferências simultâneas em sentidos opostos:

```
Caixa 1: transferir de A para B     Caixa 2: transferir de B para A
trava A                             trava B
quer B (está com o Caixa 2)         quer A (está com o Caixa 1)
```

Cada caixa segura o cadeado que o outro quer, e nenhum dos dois solta o seu. Ficam parados para sempre. Um deadlock só acontece quando as quatro **condições de Coffman** valem ao mesmo tempo:

| Condição | No simulador |
|---|---|
| **Exclusão mútua** | cada cofre só pode estar travado por um caixa por vez |
| **Posse e espera** | o caixa segura o cadeado da origem enquanto espera o do destino |
| **Não preempção** | ninguém toma o cadeado de um caixa à força; só ele mesmo solta |
| **Espera circular** | Caixa 1 espera o Caixa 2, que espera o Caixa 1 |

### Como a ordenação quebra a espera circular

Basta derrubar uma das quatro condições. O modo ordenado derruba a **espera circular**: todos os caixas travam as contas na mesma ordem global (menor id primeiro), seja qual for o sentido da transferência.

Para existir um ciclo, algum caixa teria que segurar uma conta de id maior enquanto espera uma de id menor. Com a regra do menor id primeiro isso nunca acontece: quem espera uma conta só pode estar segurando contas de id menor que ela. Os ids ao longo de qualquer cadeia de espera só crescem, e uma sequência que só cresce não fecha um ciclo.

No exemplo acima, os dois caixas tentam travar A primeiro. Um consegue, o outro espera sem segurar nada. O primeiro termina, solta, e o segundo segue.

### Detecção de deadlock

Cada caixa publica na memória compartilhada qual lock possui e qual está esperando. Um watchdog na thread principal (`src/sim/watchdog.ts`) lê esses dados a cada 20 ms e monta o **grafo de espera** (wait-for graph): caixa → lock que ele espera → caixa dono desse lock. Se houver um ciclo confirmado em duas leituras seguidas, é deadlock. Como rede de segurança, também declara deadlock se nenhum progresso acontecer por alguns segundos com caixas esperando lock.

Ao detectar, o app encerra os workers, destaca em vermelho os caixas e as contas do ciclo, desenha o ciclo (Caixa 1 → Conta A → Caixa 2 → Conta B → Caixa 1) e salva a execução com status "deadlock" e as métricas parciais.

## Métricas

Cada execução registra: makespan, espera na fila (média, mínima e máxima), espera média separada entre preferenciais e comuns, turnaround médio, throughput, utilização de cada caixa, tempo esperando lock (por caixa e total), dinheiro inconsistente, número de contas com saldo errado, carga por caixa (ρ), L e Lq do Teorema de Little e status (concluída, deadlock ou interrompida), além da data, do cenário, do algoritmo, do modo de lock e da configuração completa.

### Teorema de Little e estabilidade

Ao final de cada execução o app aplica a teoria das filas aos valores medidos. Os resultados entram no benchmark: aparecem no resumo da execução, na tabela e na matriz da aba Comparações.

**Dá para atender tudo?** A resposta vem da carga por caixa:

```
ρ = λ·S / c
```

onde λ é a taxa de chegada (clientes por segundo na janela de chegadas), S o tempo médio de atendimento medido e c o número de caixas. Se ρ < 1, os caixas dão conta do ritmo das chegadas. Se ρ ≥ 1, chega mais trabalho do que eles atendem e a fila cresce enquanto houver chegadas; o app informa quantos caixas seriam necessários. Como a fila do cenário é finita, a execução termina mesmo com ρ ≥ 1, só que com esperas longas.

**Teorema de Little.** O número médio de clientes em um sistema é a taxa de vazão vezes o tempo médio que cada um passa nele:

```
L  = λ·W     clientes na agência (W = turnaround médio)
Lq = λ·Wq    clientes na fila     (Wq = espera média)
```

Aqui λ é a vazão efetiva da execução inteira (clientes atendidos ÷ makespan). A diferença L − Lq é o número médio de caixas ocupados, que confere com a soma das utilizações.

## Roteiro sugerido de demonstração

1. **Conhecer a fila.** Na aba **Cenário e fila**, escolha o preset *Padrão* e mostre as chegadas ao longo do tempo, a composição da fila e as transferências entre contas.
2. **Conhecer a simulação.** Na aba **Simulação**, FCFS, lock por cofre ordenado, velocidade 0,1×. Clique em **Iniciar** e acompanhe a fila, os caixas, os cadeados nos cofres e o Gantt. A invariante fica verde até o fim.
3. **Race condition.** Preset *Corrida*, modo **Sem lock**. O painel da invariante fica vermelho no meio da execução e os cofres mostram "deveria ser R$ ...". Rode de novo: o valor inconsistente muda a cada vez, porque depende de como o sistema operacional intercala as threads.
4. **Corrigir com lock.** Mesmo cenário com **Lock global** e depois **Por cofre (ordenado)**. Os dois fecham a invariante em zero. Compare o makespan e o tempo esperando lock: o global serializa todo mundo, o por cofre deixa contas diferentes andarem em paralelo.
5. **Deadlock.** Preset *Deadlock*, modo **Por cofre (sem ordem)**. Em frações de segundo os caixas travam. O app mostra o ciclo e as quatro condições de Coffman podem ser apontadas na tela. Troque para o modo ordenado e o mesmo cenário termina normalmente.
6. **Starvation e aging.** Preset *Starvation*. Rode com **Prioridade** e depois com **Prioridade + Aging**. No gráfico "preferenciais vs. comuns", a espera dos comuns cai com o aging e a dos preferenciais sobe um pouco. Compare também com FCFS e SJF.
7. **Visão geral.** Clique em **Rodar as 16 combinações** em cada preset. Na aba **Comparações**, escolha o cenário e analise:
   - a matriz algoritmo × sincronismo, trocando a métrica (as células de deadlock ficam marcadas);
   - os quatro gráficos de barras;
   - duas a quatro execuções marcadas na tabela, lado a lado, com os Gantts.
8. **Repetibilidade.** Rode a mesma combinação várias vezes. A fila é idêntica (mesma seed), mas os tempos variam um pouco e a inconsistência do "sem lock" varia muito. A matriz e os gráficos passam a mostrar média e desvio padrão.

## Organização do código

```
src/
  sim/
    types.ts        tipos e constantes compartilhados
    rng.ts          mulberry32 e hash do cenário
    queue.ts        gerador de fila com seed, presets e limites
    scheduler.ts    FCFS, SJF, Prioridade e Aging (funções puras)
    layout.ts       layout da memória compartilhada
    mutex.ts        mutex com Atomics.compareExchange + wait/notify
    watchdog.ts     grafo de espera e detecção de deadlock
    timeline.ts     registro da execução e estado da agência em um instante
    metrics.ts      cálculo das métricas
    engine.ts       sobe os workers, roda o watchdog e monta o resultado
    *.test.ts       testes unitários
  workers/
    teller.worker.ts  lógica do caixa (roda em uma thread)
  storage/
    storage.ts      persistência no localStorage
  ui/
    SimulationPage, Palco (tela cheia), ConfigPanel, QueuePage, Fila, Caixas, Cofres, Gantt,
    DeadlockPanel, MetricsSummary, Comparacoes, ComparisonCharts
```

Stack: Vite, TypeScript, React, Chart.js (via react-chartjs-2) e Vitest. Não há backend.

## Limitações conhecidas

- Os tempos dependem da máquina e do que mais está rodando nela. Para comparar números, rode todas as combinações na mesma máquina e na mesma sessão.
- Navegadores reduzem a frequência de timers em abas em segundo plano. Deixe a aba visível durante as execuções, senão a detecção de deadlock e a animação atrasam.
- O `localStorage` tem cerca de 5 MB. Cada execução ocupa alguns kB; se encher, o app avisa. Exclua execuções antigas na tabela ou use **Limpar tudo**.
