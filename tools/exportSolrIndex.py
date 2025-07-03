import requests
import json
import argparse
from tqdm import tqdm

# Configuration
SOLR_URL = 'http://localhost:8983/solr'
ROWS_PER_REQUEST = 1000  # Number of documents per page

def fetch_all_documents(core_name):
    cursor_mark = '*'
    all_docs = []
    output_file = f'{core_name}_documents.json'

    params = {
        'q': '*:*',
        'rows': ROWS_PER_REQUEST,
        'wt': 'json',
        'sort': 'id asc',  # Required for cursorMark
        'cursorMark': cursor_mark,
    }

    select = 'refs' if core_name == 'rad' else 'select'
    base_url = f'{SOLR_URL}/{core_name}/{select}'
    response = requests.get(base_url, params=params)

    if response.status_code != 200:
        raise Exception(f"Initial request failed: {response.status_code}, {response.text}")

    data = response.json()
    total_docs = data['response']['numFound']
    docs = data['response']['docs']
    all_docs.extend(docs)
    next_cursor_mark = data.get('nextCursorMark')

    total_batches = (total_docs // ROWS_PER_REQUEST) + (1 if total_docs % ROWS_PER_REQUEST else 0)
    pbar = tqdm(total=total_batches, desc=f'Fetching from core: {core_name}')
    pbar.update(1)

    while next_cursor_mark != cursor_mark:
        cursor_mark = next_cursor_mark
        params['cursorMark'] = cursor_mark
        response = requests.get(base_url, params=params)

        if response.status_code != 200:
            raise Exception(f"Request failed: {response.status_code}, {response.text}")

        data = response.json()
        docs = data['response']['docs']
        all_docs.extend(docs)
        next_cursor_mark = data.get('nextCursorMark')
        pbar.update(1)

    pbar.close()
    print(f"Total documents fetched: {len(all_docs)}")

    # Save to file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_docs, f, indent=2)

    print(f"Documents saved to {output_file}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Export all documents from a Solr core to a JSON file.')
    parser.add_argument('core', help='Name of the Solr core to export from')

    args = parser.parse_args()
    fetch_all_documents(args.core)
