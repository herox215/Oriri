const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log('Usage: oriri <command>');
  console.log('');
  console.log('Commands:');
  console.log('  init        Initialize Oriri in the current directory');
  console.log('  help        Show this help message');
  console.log('');
  console.log('Run "oriri <command> --help" for more information about a command.');
}

function main(): void {
  switch (command) {
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "oriri --help" for usage information.');
      process.exitCode = 1;
  }
}

main();
