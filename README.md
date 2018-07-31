** Query Mongo Prod **

This is a terminal app that allows a user to query rater's production mongodb with one or several quote ID's.

PREREQUISITES
    - An ssh login for Bastion server (contact dev ops for this)
    - Password for the rater production mongodb (someone on rater team or Dev Ops can give you this)
    - Node Version >= 6

SETUP
    - Clone/Download repo -> npm install from root of this project
    - Run the following command (assuming you have an ssh key - if not contact Dev Ops):
        ssh-add ~/.ssh/id_rsa
        * Note - if you ever restart your machine, you'll need to run the above command again for this program to work

RUN
    - npm start (from the root of this repo) and follow the prompts

INPUT: .txt file with quote ID's separated by new lines
OUTPUT: Quote payloads are written to Results/quotes.txt in this repo