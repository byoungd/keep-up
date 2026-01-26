import { Command } from "commander";
import { writeStderr, writeStdout } from "../utils/terminal";

const TOP_LEVEL = ["agent", "doctor", "completion"];
const AGENT_SUB = ["run", "tui", "session", "config"];
const SESSION_SUB = ["list", "resume", "export", "delete"];
const CONFIG_SUB = ["show", "set", "unset"];

export function completionCommand(): Command {
  return new Command("completion")
    .description("Generate shell completion script")
    .argument("<shell>", "Shell type: bash, zsh, fish")
    .action((shell: string) => {
      const script = renderCompletion(shell);
      if (!script) {
        writeStderr(`Unsupported shell: ${shell}`);
        process.exit(1);
      }
      writeStdout(script);
    });
}

function renderCompletion(shell: string): string | null {
  switch (shell) {
    case "bash":
      return renderBash();
    case "zsh":
      return renderZsh();
    case "fish":
      return renderFish();
    default:
      return null;
  }
}

function renderBash(): string {
  return `# Bash completion for keepup
_keepup_complete() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD - 1]}"

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${TOP_LEVEL.join(" ")}" -- "$cur") )
    return 0
  fi

  if [[ \${COMP_WORDS[1]} == "agent" ]]; then
    if [[ $COMP_CWORD -eq 2 ]]; then
      COMPREPLY=( $(compgen -W "\${AGENT_SUB.join(" ")}" -- "$cur") )
      return 0
    fi
    if [[ \${COMP_WORDS[2]} == "session" && $COMP_CWORD -eq 3 ]]; then
      COMPREPLY=( $(compgen -W "\${SESSION_SUB.join(" ")}" -- "$cur") )
      return 0
    fi
    if [[ \${COMP_WORDS[2]} == "config" && $COMP_CWORD -eq 3 ]]; then
      COMPREPLY=( $(compgen -W "\${CONFIG_SUB.join(" ")}" -- "$cur") )
      return 0
    fi
  fi
}

complete -F _keepup_complete keepup
`;
}

function renderZsh(): string {
  return `#compdef keepup

_arguments \
  '1:command:(${TOP_LEVEL.join(" ")})' \
  '2:agent subcommand:(${AGENT_SUB.join(" ")})' \
  '3:session subcommand:(${SESSION_SUB.join(" ")})' \
  '3:config subcommand:(${CONFIG_SUB.join(" ")})'
`;
}

function renderFish(): string {
  return `# Fish completion for keepup
complete -c keepup -n '__fish_use_subcommand' -a '${TOP_LEVEL.join(" ")}'
complete -c keepup -n '__fish_seen_subcommand_from agent' -a '${AGENT_SUB.join(" ")}'
complete -c keepup -n '__fish_seen_subcommand_from session' -a '${SESSION_SUB.join(" ")}'
complete -c keepup -n '__fish_seen_subcommand_from config' -a '${CONFIG_SUB.join(" ")}'
`;
}
