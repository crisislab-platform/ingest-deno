if [ -z "$(git status --porcelain)" ]; then 
  # Working directory clean
    echo "Building & saving Docker image..."

    git_hash=$(git rev-parse --verify --short HEAD)
    file_name="ingest-deno-image-$git_hash.tar"

    docker build -t ingest-deno .

    docker save ingest-deno -o $file_name

    echo "Saved Docker image as '$file_name'"
else 
  # Uncommitted changes
  echo "You have uncomitted changes!\nPlease clean up your git directory then run this command again."
fi


