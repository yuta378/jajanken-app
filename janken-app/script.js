const rockButton = document.getElementById('rock');
const scissorsButton = document.getElementById('scissors');
const paperButton = document.getElementById('paper');
const resultText = document.getElementById('result');
const playerHand = document.getElementById('playerHand');
const computerHand = document.getElementById('computerHand');
const playerShape = document.getElementById('playerShape');
const computerShape = document.getElementById('computerShape');
const playerChoiceText = document.getElementById('playerChoiceText');
const computerChoiceText = document.getElementById('computerChoiceText');

const choiceButtons = [rockButton, scissorsButton, paperButton];
let isPlaying = false;
const handMap = {
    グー: '✊',
    チョキ: '✌️',
    パー: '🖐️'
};

rockButton.addEventListener('click', () => playJanken('グー'));
scissorsButton.addEventListener('click', () => playJanken('チョキ'));
paperButton.addEventListener('click', () => playJanken('パー'));

function playJanken(playerChoice) {
    if (isPlaying) {
        return;
    }

    isPlaying = true;
    setButtonsDisabled(true);

    const choices = ['グー', 'チョキ', 'パー'];
    const computerChoice = choices[Math.floor(Math.random() * choices.length)];
    let result = '';
    let resultClass = 'draw';

    resultText.className = 'counting';
    resultText.textContent = 'じゃん...';
    playerShape.textContent = '?';
    computerShape.textContent = '?';
    playerChoiceText.textContent = '?';
    computerChoiceText.textContent = '?';

    playerHand.classList.remove('reveal');
    computerHand.classList.remove('reveal');
    playerHand.classList.add('shaking');
    computerHand.classList.add('shaking');

    setTimeout(() => {
        resultText.textContent = '...けん...';
    }, 420);

    setTimeout(() => {
        playerHand.classList.remove('shaking');
        computerHand.classList.remove('shaking');
        playerHand.classList.add('reveal');
        computerHand.classList.add('reveal');

        playerShape.textContent = handMap[playerChoice];
        computerShape.textContent = handMap[computerChoice];
        playerChoiceText.textContent = `${handMap[playerChoice]} ${playerChoice}`;
        computerChoiceText.textContent = `${handMap[computerChoice]} ${computerChoice}`;

        if (playerChoice === computerChoice) {
            result = 'あいこです！';
            resultClass = 'draw';
        } else if (
            (playerChoice === 'グー' && computerChoice === 'チョキ') ||
            (playerChoice === 'チョキ' && computerChoice === 'パー') ||
            (playerChoice === 'パー' && computerChoice === 'グー')
        ) {
            result = 'あなたの勝ちです！';
            resultClass = 'win';
        } else {
            result = 'あなたの負けです！';
            resultClass = 'lose';
        }

        resultText.className = `${resultClass} flash`;
        resultText.textContent = `ぽん！ ${result}`;

        setButtonsDisabled(false);
        isPlaying = false;
    }, 960);
}

function setButtonsDisabled(isDisabled) {
    choiceButtons.forEach((button) => {
        button.disabled = isDisabled;
    });
}
