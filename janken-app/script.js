document.getElementById('rock').addEventListener('click', () => playJanken('グー'));
document.getElementById('scissors').addEventListener('click', () => playJanken('チョキ'));
document.getElementById('paper').addEventListener('click', () => playJanken('パー'));

function playJanken(playerChoice) {
    const choices = ['グー', 'チョキ', 'パー'];
    const computerChoice = choices[Math.floor(Math.random() * choices.length)];
    let result = '';

    if (playerChoice === computerChoice) {
        result = 'あいこです！';
    } else if (
        (playerChoice === 'グー' && computerChoice === 'チョキ') ||
        (playerChoice === 'チョキ' && computerChoice === 'パー') ||
        (playerChoice === 'パー' && computerChoice === 'グー')
    ) {
        result = 'あなたの勝ちです！';
    } else {
        result = 'あなたの負けです！';
    }

    document.getElementById('result').textContent = `コンピュータの手: ${computerChoice} - ${result}`;
}