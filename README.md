# Itander: simulador de agência bancária

Trabalho da disciplina de Sistemas Operacionais (C12, Inatel) sobre escalonamento e sincronismo de threads. A agência fictícia Itander roda inteira no navegador: cada caixa é uma thread real (Web Worker), os saldos ficam em memória compartilhada (SharedArrayBuffer) e cada cliente da fila traz uma operação sobre essas contas.

O app compara, sobre a mesma fila de clientes:

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

`SharedArrayBuffer` permite que várias threads leiam e escrevam a mesma memória. Depois dos ataques Spectre, os navegadores só liberam esse recurso em páginas cross-origin isolated, isto é, páginas que garantem não compartilhar o processo com conteúdo de outras origens. O servidor declara isso com dois headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

O `vite.config.ts` envia os dois tanto no `npm run dev` quanto no `npm run preview`. Sem eles, `crossOriginIsolated` fica `false`, o `SharedArrayBuffer` não existe e o app mostra um aviso no topo e não roda. Abrir o `index.html` direto do disco ou servir `dist/` com um servidor qualquer cai nesse caso. O isolamento também exige contexto seguro: `localhost` ou HTTPS.

## Como a simulação funciona

### Threads e memória reais

- Cada caixa é um Web Worker separado (`src/workers/teller.worker.ts`).
- Saldos, locks, fila, estado de cada caixa e o registro do que aconteceu ficam em um único `Int32Array` sobre um `SharedArrayBuffer` (`src/sim/layout.ts`).
- Os workers usam `Atomics` para tudo: `compareExchange` e `wait`/`notify` nos mutexes, `store`/`load`/`add` no estado e nos contadores.
- O "sleep" do worker é um `Atomics.wait` com timeout em uma célula que ninguém notifica.
- A thread principal não executa nenhuma operação bancária. Ela só lê a memória a cada quadro (`requestAnimationFrame`) para desenhar, e roda o watchdog de deadlock.
- Valores em centavos e tempos em microssegundos, sempre inteiros.

### A operação bancária

Todo atendimento tem duas partes:

1. Atendimento, fora da seção crítica: o caixa dorme a duração estimada da operação.
2. Seção crítica: o caixa lê o saldo, dorme a janela crítica configurável e escreve o novo saldo.

Sem lock, a janela entre ler e escrever deixa a race condition aparecer.

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

Cada escrita de saldo registra também o quanto a conta *deveria* ter variado. A diferença entre o saldo real e o esperado é o dinheiro inconsistente, calculado em toda execução e mostrado ao vivo no painel da invariante (que fica vermelho quando diverge). O app também conta quantas contas terminaram com o saldo errado, porque em cenários só de transferências o total pode fechar por coincidência com contas individuais erradas.

### Cenário reproduzível

A fila é gerada por um PRNG com semente (mulberry32, em `src/sim/rng.ts`). A mesma configuração com a mesma seed gera exatamente a mesma fila, e por isso todos os algoritmos são comparados sobre o mesmo cenário. Cada cenário tem um hash da configuração, e cada execução salva guarda esse hash.

O app tem três abas, na ordem de uso: Cenário e fila (configurar e ver a fila), Simulação (rodar) e Comparações (analisar os resultados).

A aba Cenário e fila mostra a fila gerada antes de rodar e se atualiza a cada mudança na configuração. Ela traz as pessoas chegando na agência ao longo do tempo, o ritmo de chegada comparado com a capacidade dos caixas, a divisão entre preferenciais e comuns e quantos clientes vieram fazer cada operação.

Presets prontos:

- Padrão: mistura de operações, 4 caixas e 5 contas.
- Corrida: muitas transferências sobre 3 contas, para mostrar a race condition.
- Deadlock: 2 contas e 100% de transferências cruzadas (A→B e B→A).
- Starvation: dois terços dos clientes são preferenciais e a fila nunca esvazia. Com Prioridade, os comuns desistem e algumas crianças de colo vão para o chão.

### Câmera lenta sem alterar o benchmark

A execução acontece em tempo real, na velocidade das threads. Os workers registram na memória compartilhada os instantes de cada evento (início e fim de atendimento, espera e posse de lock, cada escrita de saldo), e a tela é desenhada como uma função pura de (registro, instante). O controle de velocidade, a pausa e a barra de tempo mudam só o que é exibido. As métricas vêm do tempo real medido pelos workers.

### Tela cheia

Na aba Simulação, a opção Tela cheia troca os painéis por um palco. As pessoas entram pela porta, esperam na fila, andam até o caixa e saem. O dinheiro anda entre os cofres e os caixas, e uma linha liga cada caixa ao cadeado que ele tem (contínua) ou espera (tracejada). `Esc` volta à visualização normal.

Cada pessoa na fila tem uma barra de paciência e um rosto que vai do sorriso à fúria conforme a espera aumenta. Quem esgota a paciência sai pela porta. O idoso que passa mal fica tonto e curvado, com a bengala no chão, e a criança colocada no chão aparece sentada ao lado do responsável. O painel Starvation, no topo, mostra a maior espera do momento, quantos clientes estão irritados e a espera média de preferenciais e comuns. O painel Satisfação mostra o índice ao vivo, o humor médio, as desistências e os eventos até o instante exibido.

Todos os personagens e ícones são SVG desenhados no próprio app, sem emoji.

## Comportamento humano na fila

### Paciência e desistência

Cada cenário tem uma paciência P, em ms. O valor sugerido equivale a quatro atendimentos médios: a duração esperada pela mistura de operações, mais a janela crítica. Ao escolher um preset, a paciência já vem com esse valor, e o painel de configuração avisa quando ela foi alterada e oferece voltar à sugerida.

Quem espera P sem ser chamado desiste e vai embora sem ser atendido. Isso acontece na simulação real, dentro do worker: toda vez que um caixa varre a fila com o lock da fila, ele marca como desistente quem já passou da paciência (status `CLIENT_GAVE_UP` na memória compartilhada) e registra o instante da desistência como chegada + P. Como o caixa só olha a fila quando fica livre, o registro usa o instante exato em que a paciência acabou, e não o da varredura. Se a execução termina em deadlock ou é interrompida, quem ficou na fila além de P também conta como desistente. Uma fila que termina com desistentes conta como execução concluída.

### Preferenciais: idosos e crianças de colo

Cada preferencial é sorteado como idoso (60%) ou pessoa com criança de colo (40%). O sorteio usa um gerador separado, `mulberry32(seed ^ 0x9e3779b9)`, então os demais campos das filas que já existiam continuam iguais para a mesma seed.

| Evento | Quando acontece |
|---|---|
| idoso passa mal | ao completar 60% de P esperando |
| criança é colocada no chão | ao completar 40% de P esperando |

O caixa registra o instante de cada evento (chegada + fração de P) na mesma varredura da fila.

### Humor

O humor de cada cliente é medido no instante em que ele é chamado ou desiste, pela fração da paciência que já gastou, na mesma escala dos rostos do palco:

| Nível | Humor | Espera |
|---|---|---|
| 0 | feliz | abaixo de 0,3·P |
| 1 | neutro | abaixo de 0,6·P |
| 2 | entediado | abaixo de 0,85·P |
| 3 | irritado | abaixo de P |
| 4 | furioso | P ou mais |

As métricas trazem a média, a mediana e o percentil 90 do humor. O P90 mostra como estão os 10% mais irritados.

### Índice de satisfação

Cada cliente recebe uma nota de 0 a 1:

1. Tempo: nota 1 até a tolerância T = 0,25·P. Depois cai em linha reta até 0 quando a espera chega a P:

   ```
   notaTempo = 1                       se espera ≤ T
   notaTempo = (P − espera) / (P − T)  se T < espera < P
   ```

2. Dinheiro: se alguma conta que o cliente movimentou terminou com saldo errado (race condition no modo sem lock), a nota é multiplicada por 0,5.
3. Operação recusada por saldo insuficiente: a nota é multiplicada por 0,8.
4. Criança colocada no chão: a nota fica limitada a 0,6.
5. Desistiu, ou idoso que passou mal: nota 0.
6. Incômodo coletivo: quem está dentro da agência (na fila ou sendo atendido) no instante em que um idoso passa mal tem a nota multiplicada por 0,8; quando uma criança vai para o chão, por 0,9. Os descontos se acumulam, com piso: o incômodo nunca tira mais que metade da nota. A própria vítima não conta como testemunha.

```
índice = 100 × média das notas
```

Ao lado do índice ficam a mediana e o percentil 10 (a nota dos 10% piores clientes), além do índice só dos preferenciais e só dos comuns. O dinheiro inconsistente total não pesa no índice uma segunda vez: a nota de cada cliente já cai quando a conta dele termina errada.

Exemplo com P = 500 ms (T = 125 ms):

| Cliente | Espera | O que aconteceu | Nota | Humor |
|---|---|---|---|---|
| comum | 80 ms | | 1,00 | feliz |
| comum | 200 ms | | 0,80 | neutro |
| comum | 350 ms | | 0,40 | entediado |
| comum | 500 ms | desistiu | 0 | furioso |
| idoso | 320 ms | passou mal aos 300 ms | 0 | entediado |
| com criança | 250 ms | criança no chão aos 200 ms; o tempo daria 0,67 | 0,60 | neutro |
| comum | 100 ms | saque recusado | 0,80 | feliz |
| comum | 150 ms | conta terminou errada: 0,93 × 0,5 | 0,47 | neutro |
| idoso | 60 ms | | 1,00 | feliz |
| comum | 400 ms | | 0,27 | entediado |

Índice 53,3, mediana 53,3 e P10 igual a 0. Humor médio 1,3, mediana neutro e P90 2,2 (entediado). O teste `reproduz o exemplo de 10 clientes` em `src/sim/metrics.test.ts` confere essas contas.

Sem incômodo coletivo, o índice seria 53,3. Supondo que os clientes 3, 4 e 10 estavam na agência quando o idoso passou mal, e os clientes 3, 5 e 10 quando a criança foi para o chão, o cliente 3 cai de 0,40 para 0,40 × 0,8 × 0,9 = 0,29 e o cliente 10 de 0,27 para 0,19. Os clientes 4 e 5 já estavam com 0. O índice vai para 51,5.

### Reputação da empresa

A satisfação mede a experiência de cada cliente. A reputação mede o que eles contam lá fora, e incidentes públicos pesam mais do que a média dos atendimentos. Cada cliente com nota vira:

| Grupo | Nota |
|---|---|
| promotor | 0,8 ou mais |
| neutro | de 0,5 a 0,8 |
| detrator | abaixo de 0,5 (quem desistiu entra aqui) |

```
reputação = % promotores − % detratores
          − 10 por idoso que passou mal
          − 20 se alguma conta terminou com saldo errado
```

O resultado fica entre −100 e +100. É aqui que o dinheiro inconsistente pesa na execução inteira: banco que some com dinheiro vira escândalo, mesmo para quem não teve a conta afetada.

No exemplo acima (já com o incômodo coletivo) há 4 promotores, 1 neutro e 5 detratores: 40% − 50% = −10. O idoso que passou mal tira 10 e a conta errada do cliente 8 tira 20. Reputação: −40.

### Qual combinação escolher

O índice e a reputação aparecem no resumo da execução, na tabela, na matriz e nos gráficos da aba Comparações, junto com as desistências e os eventos. A aba também traz um ranking das combinações do cenário, ordenado pela reputação média, com a satisfação desempatando. Combinações que travaram em deadlock em todas as tentativas vão para o fim. Para a média ficar estável, rode as 16 combinações algumas vezes. Execuções salvas por versões anteriores não têm essas métricas e aparecem com "-".

## Algoritmos de escalonamento

Todos são não-preemptivos: quando um caixa fica livre, ele escolhe o próximo entre os clientes que já chegaram e atende até o fim. As funções ficam em `src/sim/scheduler.ts` e são puras, por isso testáveis.

A retirada da fila é protegida por um mutex próprio (o lock da fila) em todos os modos, então nenhum cliente é atendido duas vezes. Os modos de sincronismo da próxima seção dizem respeito só às contas.

- FCFS (First Come, First Served): atende na ordem de chegada. Um cliente demorado segura todos os que estão atrás dele (efeito comboio).
- SJF (Shortest Job First): atende primeiro quem tem a menor duração estimada. Reduz a espera média, e operações longas podem ser adiadas indefinidamente se continuarem chegando operações curtas.
- Prioridade: preferenciais primeiro, com empate por ordem de chegada. Clientes comuns podem sofrer starvation, porque enquanto houver preferencial na fila eles não são chamados.
- Prioridade com Aging: a prioridade efetiva cresce com o tempo de espera.

  ```
  prioridadeEfetiva = prioridadeBase + tempoDeEspera / passoDoAging
  ```

  Um preferencial começa com 1 e um comum com 0. A cada "passo do aging" de espera o cliente ganha um nível, então um comum que já esperou bastante passa na frente de um preferencial recém-chegado. A starvation diminui e os preferenciais continuam na frente quando as esperas são parecidas.

## Modos de sincronismo das contas

O mutex (`src/sim/mutex.ts`) é uma célula do `Int32Array` com três estados (livre, travado, travado com alguém esperando). Travar é um `Atomics.compareExchange`; se falhar, a thread dorme com `Atomics.wait` e é acordada por um `Atomics.notify` de quem destrava. O tempo que cada caixa passa esperando lock é registrado.

1. Sem lock: ninguém trava nada, e a race condition acontece de verdade.
2. Lock global: um único mutex para todas as contas. O resultado fica correto, só que duas operações nunca ficam na seção crítica ao mesmo tempo, mesmo sobre contas diferentes.
3. Lock por cofre (ordenado): um mutex por conta. Na transferência, trava sempre a conta de menor id primeiro. O resultado fica correto, contas diferentes andam em paralelo e não há deadlock.
4. Lock por cofre sem ordenação: um mutex por conta, travando a origem e depois o destino. Pode entrar em deadlock.

### Por que "sem lock" gera inconsistência

Atualizar um saldo não é uma operação atômica. São três passos: ler, modificar e escrever (read-modify-write). Se dois caixas intercalam esses passos sobre a mesma conta, uma das atualizações se perde:

```
Conta A começa com R$ 1.000

Caixa 1 (depósito de R$ 100)        Caixa 2 (depósito de R$ 50)
lê 1.000
                                    lê 1.000
escreve 1.100
                                    escreve 1.050   <- sobrescreve o 1.100

Resultado: R$ 1.050. Deveria ser R$ 1.150. R$ 100 sumiram.
```

O caixa 2 calculou o novo saldo a partir de um valor que já estava velho. Dependendo de quem perde a atualização, dinheiro some ou aparece. A janela crítica alarga o intervalo entre ler e escrever e aumenta a chance de intercalação.

### Por que "por cofre sem ordenação" gera deadlock

Considere duas transferências simultâneas em sentidos opostos:

```
Caixa 1: transferir de A para B     Caixa 2: transferir de B para A
trava A                             trava B
quer B (está com o Caixa 2)         quer A (está com o Caixa 1)
```

Cada caixa segura o cadeado que o outro quer e nenhum dos dois solta o seu, então os dois ficam parados para sempre. Um deadlock só acontece quando as quatro condições de Coffman valem ao mesmo tempo:

| Condição | No simulador |
|---|---|
| Exclusão mútua | cada cofre só pode estar travado por um caixa por vez |
| Posse e espera | o caixa segura o cadeado da origem enquanto espera o do destino |
| Não preempção | ninguém toma o cadeado de um caixa à força; só ele mesmo solta |
| Espera circular | Caixa 1 espera o Caixa 2, que espera o Caixa 1 |

### Como a ordenação quebra a espera circular

Derrubar uma das quatro condições já impede o deadlock. O modo ordenado derruba a espera circular: todos os caixas travam as contas na mesma ordem global (menor id primeiro), seja qual for o sentido da transferência.

Para existir um ciclo, algum caixa teria que segurar uma conta de id maior enquanto espera uma de id menor. Com a regra do menor id primeiro isso nunca acontece: quem espera uma conta só pode estar segurando contas de id menor que ela. Os ids ao longo de qualquer cadeia de espera só crescem, e uma sequência que só cresce não fecha um ciclo.

No exemplo acima, os dois caixas tentam travar A primeiro. Um consegue, o outro espera sem segurar nada. O primeiro termina, solta, e o segundo segue.

### Detecção de deadlock

Cada caixa publica na memória compartilhada qual lock possui e qual está esperando. Um watchdog na thread principal (`src/sim/watchdog.ts`) lê esses dados a cada 20 ms e monta o grafo de espera (wait-for graph): caixa → lock que ele espera → caixa dono desse lock. Se houver um ciclo confirmado em duas leituras seguidas, é deadlock. Como rede de segurança, também declara deadlock se nenhum progresso acontecer por alguns segundos com caixas esperando lock.

Ao detectar, o app encerra os workers, destaca em vermelho os caixas e as contas do ciclo, desenha o ciclo (Caixa 1 → Conta A → Caixa 2 → Conta B → Caixa 1) e salva a execução com status "deadlock" e as métricas parciais.

## Métricas

Cada execução registra: makespan, espera na fila (média, mínima e máxima), espera média separada entre preferenciais e comuns, turnaround médio, throughput, utilização de cada caixa, tempo esperando lock (por caixa e total), dinheiro inconsistente, número de contas com saldo errado, carga por caixa (ρ), L e Lq do Teorema de Little, desistências, idosos que passaram mal, crianças no chão, clientes incomodados por esses incidentes, humor (média, mediana e P90), índice de satisfação (média, mediana, P10, preferenciais e comuns), reputação da empresa (com promotores, neutros e detratores) e status (concluída, deadlock ou interrompida), além da data, do cenário, do algoritmo, do modo de lock e da configuração completa.

### Teorema de Little e estabilidade

Ao final de cada execução o app aplica a teoria das filas aos valores medidos. Os resultados entram no benchmark: aparecem no resumo da execução, na tabela e na matriz da aba Comparações.

Para saber se dá para atender tudo, o app calcula a carga por caixa:

```
ρ = λ·S / c
```

onde λ é a taxa de chegada (clientes por segundo na janela de chegadas), S o tempo médio de atendimento medido e c o número de caixas. Se ρ < 1, os caixas dão conta do ritmo das chegadas. Se ρ ≥ 1, chega mais trabalho do que eles atendem e a fila cresce enquanto houver chegadas; o app informa quantos caixas seriam necessários. Como a fila do cenário é finita, a execução termina mesmo com ρ ≥ 1, só que com esperas longas.

O Teorema de Little diz que o número médio de clientes em um sistema é a vazão vezes o tempo médio que cada um passa nele:

```
L  = λ·W     clientes na agência (W = turnaround médio)
Lq = λ·Wq    clientes na fila     (Wq = espera média)
```

Aqui λ é a vazão efetiva da execução inteira (clientes atendidos ÷ makespan). A diferença L − Lq é o número médio de caixas ocupados, que confere com a soma das utilizações.

## Roteiro sugerido de demonstração

1. Conhecer a fila. Na aba Cenário e fila, escolha o preset Padrão e mostre as pessoas chegando, o ritmo de chegada contra a capacidade dos caixas e o que cada cliente veio fazer.
2. Conhecer a simulação. Na aba Simulação, escolha FCFS e lock por cofre ordenado, velocidade 0,1x, e clique em Iniciar. Acompanhe a fila, os caixas, os cadeados nos cofres e o Gantt. A invariante fica verde até o fim.
3. Race condition. Preset Corrida, modo Sem lock. O painel da invariante fica vermelho no meio da execução e os cofres mostram "deveria ser R$ ...". O índice de satisfação cai, porque quem movimentou uma conta que terminou errada perde metade da nota. Rodando de novo, o valor inconsistente muda, porque depende de como o sistema operacional intercala as threads.
4. Corrigir com lock. Mesmo cenário com Lock global e depois Por cofre (ordenado). Os dois fecham a invariante em zero. Compare o makespan e o tempo esperando lock: o global serializa todos os caixas e o por cofre deixa contas diferentes andarem em paralelo.
5. Deadlock. Preset Deadlock, modo Por cofre (sem ordem). Em frações de segundo os caixas travam e o app desenha o ciclo, onde dá para apontar as quatro condições de Coffman. No modo ordenado, o mesmo cenário termina normalmente.
6. Starvation e aging. Preset Starvation, com Prioridade e depois com Prioridade + Aging. Com Prioridade, os preferenciais quase não esperam e os comuns desistem. Com aging, menos comuns desistem e o índice de satisfação dos comuns sobe; em troca, os preferenciais esperam mais, idosos passam mal e o índice geral cai. O gráfico de satisfação de preferenciais e comuns mostra essa troca. Vale abrir a tela cheia para ver os rostos irritados e quem sai pela porta.
7. Visão geral. Clique em Rodar as 16 combinações em cada preset. Na aba Comparações, escolha o cenário e analise a matriz algoritmo × sincronismo (as células de deadlock ficam marcadas), os quatro gráficos de barras e duas a quatro execuções lado a lado, com os Gantts.
8. Repetibilidade. Rode a mesma combinação várias vezes. A fila é idêntica, os tempos variam um pouco e a inconsistência do sem lock varia muito. A matriz e os gráficos passam a mostrar média e desvio padrão.

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
    satisfaction.ts paciência, eventos, incômodo coletivo, humor, satisfação e reputação
    engine.ts       sobe os workers, roda o watchdog e monta o resultado
    *.test.ts       testes unitários
  workers/
    teller.worker.ts  lógica do caixa (roda em uma thread)
  storage/
    storage.ts      persistência no localStorage
  ui/
    icons.tsx       ícones, logo e personagens em SVG
    SimulationPage, Palco (tela cheia), ConfigPanel, QueuePage, Fila, Caixas, Cofres, Gantt,
    DeadlockPanel, MetricsSummary, Comparacoes, ComparisonCharts
```

Stack: Vite, TypeScript, React, Chart.js (via react-chartjs-2), Vitest e a fonte Plus Jakarta Sans empacotada localmente. Não há backend.

## Limitações conhecidas

- Os tempos dependem da máquina e do que mais está rodando nela. Para comparar números, rode todas as combinações na mesma máquina e na mesma sessão.
- Navegadores reduzem a frequência de timers em abas em segundo plano. Com a aba em segundo plano, a detecção de deadlock e a animação atrasam.
- O `localStorage` tem cerca de 5 MB. Cada execução ocupa alguns kB; se encher, o app avisa. Exclua execuções antigas na tabela ou use Limpar tudo.
