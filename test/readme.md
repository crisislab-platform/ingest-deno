# Ingest-deno testing

Don't just run with playwright unless you know what you're doing. There is a pretty good amount of setup that needs to be done first. Hence the script below:

## Running

Run tests like so:

```sh
./tests
```

Or with a ui for playwright

```sh
./tests --ui
```

Multiple browsers

```sh
./tests --multi
```

Playwright debug mode



```sh
./tests --debug
```

Playwright codegen


```sh
./tests --codegen
```

Run against live server instead of spinning one up locally


```sh
./tests --live
```

Don't build docker container

```sh
./tests --no-docker-build
```



## How it works

1. Build docker image of server
   - 1.5. ?? Somewhere here we need to get credentials for the script
2. Start server
3. Fill server with dummy data
   - Dummy sensors
   - User account for dashboard testing
4. Spawn background thread acting as a simulated sensor sending data
5. Start playwright. It does the following
   - Admin dashboard:
     1. Navigate to live admin webpage
     2. Change API origin to local server
     3. Authenticate with credentials generated in step 3
     4. Run all test cases
   - Shakemap:
     1. Navigate to live shakemap webpage
     2. Change API origin to local server
     3. Run all test cases
