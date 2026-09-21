const vscode = require('vscode')

let chooseEntryCalls = 0

exports.activate = function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('slidev.choose-entry', () => {
    chooseEntryCalls++
  }))
  return { chooseEntryCalls: () => chooseEntryCalls }
}
